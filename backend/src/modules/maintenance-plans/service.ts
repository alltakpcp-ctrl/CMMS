import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../lib/AppError";
import { calculateNextDueDate, DueDateResult } from "../../lib/maintenancePlans";
import { generateWorkOrderNumber } from "../../lib/workOrderNumber";
import { resolveAssigneeIds } from "../../lib/assignees";
import { workOrderInclude } from "../workorders/service";
import { AuthPayload } from "../../middlewares/authenticate";
import { MaintenancePeriodicity, WorkOrderStatus, WorkOrderType } from "../../domain/enums";
import {
  CreateMaintenancePlanInput,
  GenerateWorkOrderFromPlanInput,
  ListMaintenancePlansQuery,
  UpdateMaintenancePlanInput,
} from "./schema";

async function assertAssetExists(assetId: string) {
  const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { id: true } });
  if (!asset) {
    throw new AppError(404, "ASSET_NOT_FOUND", "Ativo não encontrado.");
  }
}

export async function getMaintenancePlanById(id: string) {
  const plan = await prisma.maintenancePlan.findUnique({ where: { id }, include: { asset: true } });
  if (!plan) {
    throw new AppError(404, "MAINTENANCE_PLAN_NOT_FOUND", "Plano de manutenção não encontrado.");
  }
  return plan;
}

// Núcleo compartilhado de "criar plano" (1º ciclo) e "gerar OS" (ciclos
// seguintes): cria a WorkOrder já PROGRAMADA, vinculada ao plano, com o
// responsável principal + apoio vindos de assigneeIds (mesmo padrão de
// programacao() em workorders/service.ts). Não passa por
// canTransition/applyTransition — atalho deliberado, mesmo espírito de
// timelineOverride: quem agenda a preventiva já forneceu data/hora e
// técnico, não faz sentido exigir triagem/planejamento manuais depois.
async function generateWorkOrderFromPlan(
  tx: Prisma.TransactionClient,
  plan: { id: string; assetId: string; discipline: string; title: string; description: string | null; priority: string; estimatedHours: Prisma.Decimal | null; active: boolean },
  input: GenerateWorkOrderFromPlanInput,
  user: AuthPayload
) {
  if (!plan.active) {
    throw new AppError(409, "PLAN_INACTIVE", "Plano de manutenção está inativo.");
  }

  const openWorkOrder = await tx.workOrder.findFirst({
    where: {
      maintenancePlanId: plan.id,
      status: { notIn: [WorkOrderStatus.ENCERRADA, WorkOrderStatus.CANCELADA] },
    },
    select: { id: true, number: true },
  });
  if (openWorkOrder) {
    throw new AppError(
      409,
      "PLAN_HAS_OPEN_WORK_ORDER",
      `Já existe uma OS em aberto para este plano (${openWorkOrder.number}).`
    );
  }

  const [principalId, ...supportIds] = await resolveAssigneeIds(tx, input.assigneeIds);

  const number = await generateWorkOrderNumber(tx);

  const workOrder = await tx.workOrder.create({
    data: {
      number,
      type: WorkOrderType.PREVENTIVA,
      disciplina: plan.discipline,
      priority: plan.priority,
      title: plan.title,
      description: plan.description ?? "",
      assetId: plan.assetId,
      requesterId: user.userId,
      status: WorkOrderStatus.PROGRAMADA,
      maintenancePlanId: plan.id,
      scheduledStart: input.scheduledStart,
      scheduledEnd: input.scheduledEnd,
      estimatedHours: plan.estimatedHours,
      assignedToId: principalId,
      assignees: { create: supportIds.map((assigneeId) => ({ userId: assigneeId })) },
      numMaintainers: 1 + supportIds.length,
    },
    select: { id: true },
  });

  await tx.statusHistory.createMany({
    data: [
      { workOrderId: workOrder.id, fromStatus: null, toStatus: WorkOrderStatus.ABERTA, changedById: user.userId },
      {
        workOrderId: workOrder.id,
        fromStatus: WorkOrderStatus.ABERTA,
        toStatus: WorkOrderStatus.PROGRAMADA,
        changedById: user.userId,
        note: "Gerada automaticamente a partir do plano de manutenção preventiva.",
      },
    ],
  });

  return tx.workOrder.findUniqueOrThrow({ where: { id: workOrder.id }, include: workOrderInclude });
}

export async function createMaintenancePlan(input: CreateMaintenancePlanInput, user: AuthPayload) {
  await assertAssetExists(input.assetId);

  return prisma.$transaction(async (tx) => {
    const { scheduledStart, scheduledEnd, assigneeIds, ...planData } = input;

    const plan = await tx.maintenancePlan.create({ data: planData, include: { asset: true } });
    const workOrder = await generateWorkOrderFromPlan(
      tx,
      plan,
      { scheduledStart, scheduledEnd, assigneeIds },
      user
    );

    return { plan, workOrder };
  });
}

export async function generateWorkOrderFromExistingPlan(
  id: string,
  input: GenerateWorkOrderFromPlanInput,
  user: AuthPayload
) {
  return prisma.$transaction(async (tx) => {
    const plan = await tx.maintenancePlan.findUnique({ where: { id } });
    if (!plan) {
      throw new AppError(404, "MAINTENANCE_PLAN_NOT_FOUND", "Plano de manutenção não encontrado.");
    }
    return generateWorkOrderFromPlan(tx, plan, input, user);
  });
}

export async function updateMaintenancePlan(id: string, input: UpdateMaintenancePlanInput) {
  await getMaintenancePlanById(id);
  if (input.assetId) {
    await assertAssetExists(input.assetId);
  }
  return prisma.maintenancePlan.update({ where: { id }, data: input, include: { asset: true } });
}

export async function deleteMaintenancePlan(id: string) {
  await getMaintenancePlanById(id);

  const linkedWorkOrdersCount = await prisma.workOrder.count({
    where: { maintenancePlanId: id },
  });

  if (linkedWorkOrdersCount > 0) {
    throw new AppError(
      422,
      "MAINTENANCE_PLAN_HAS_WORK_ORDERS",
      `Plano possui ${linkedWorkOrdersCount} OS vinculada(s) e não pode ser excluído. Considere desativá-lo (active=false).`
    );
  }

  await prisma.maintenancePlan.delete({ where: { id } });
}

// Última Execution encerrada por plano, numa única query (evita N+1 no
// GET /maintenance-plans) — "encerrada" aqui significa workOrder.status ===
// ENCERRADA (não apenas finishedAt preenchido: um ciclo reprovado na
// validação também tem finishedAt, mas não é o desfecho definitivo).
async function lastValidExecutionByPlanId(planIds: string[]): Promise<Map<string, Date>> {
  if (planIds.length === 0) return new Map();

  const executions = await prisma.execution.findMany({
    where: {
      workOrder: { maintenancePlanId: { in: planIds }, status: WorkOrderStatus.ENCERRADA },
      finishedAt: { not: null },
    },
    select: { finishedAt: true, workOrder: { select: { maintenancePlanId: true } } },
    orderBy: { finishedAt: "desc" },
  });

  const result = new Map<string, Date>();
  for (const execution of executions) {
    const planId = execution.workOrder.maintenancePlanId;
    if (planId && !result.has(planId)) {
      result.set(planId, execution.finishedAt as Date);
    }
  }
  return result;
}

interface OpenWorkOrderSummary {
  id: string;
  number: string;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  status: string;
}

// OS em aberto (fora de ENCERRADA/CANCELADA) por plano, numa única query —
// generateWorkOrderFromPlan() garante no máximo uma por plano (409
// PLAN_HAS_OPEN_WORK_ORDER bloqueia gerar um novo ciclo enquanto existir
// uma). Usado pelo calendário da Agenda para posicionar o evento na data
// real já agendada da OS, em vez da data de vencimento calculada do plano —
// ver MaintenanceCalendar.tsx no frontend.
async function openWorkOrderByPlanId(planIds: string[]): Promise<Map<string, OpenWorkOrderSummary>> {
  if (planIds.length === 0) return new Map();

  const workOrders = await prisma.workOrder.findMany({
    where: {
      maintenancePlanId: { in: planIds },
      status: { notIn: [WorkOrderStatus.ENCERRADA, WorkOrderStatus.CANCELADA] },
    },
    select: { id: true, number: true, scheduledStart: true, scheduledEnd: true, status: true, maintenancePlanId: true },
  });

  const result = new Map<string, OpenWorkOrderSummary>();
  for (const workOrder of workOrders) {
    if (workOrder.maintenancePlanId) {
      result.set(workOrder.maintenancePlanId, workOrder);
    }
  }
  return result;
}

export async function listMaintenancePlans(query: ListMaintenancePlansQuery) {
  const where: Prisma.MaintenancePlanWhereInput = {
    assetId: query.assetId,
    discipline: query.discipline,
    priority: query.priority,
    active: query.active,
  };

  const plans = await prisma.maintenancePlan.findMany({
    where,
    include: { asset: true },
    orderBy: { createdAt: "asc" },
  });

  const planIds = plans.map((p) => p.id);
  const [lastExecutionByPlanId, openWorkOrderByPlan] = await Promise.all([
    lastValidExecutionByPlanId(planIds),
    openWorkOrderByPlanId(planIds),
  ]);

  return plans.map((plan) => {
    const lastFinishedAt = lastExecutionByPlanId.get(plan.id) ?? null;
    const dueDate: DueDateResult = calculateNextDueDate(
      { id: plan.id, periodicity: plan.periodicity as MaintenancePeriodicity | null, createdAt: plan.createdAt },
      lastFinishedAt ? { finishedAt: lastFinishedAt } : null
    );
    return { ...plan, ...dueDate, openWorkOrder: openWorkOrderByPlan.get(plan.id) ?? null };
  });
}
