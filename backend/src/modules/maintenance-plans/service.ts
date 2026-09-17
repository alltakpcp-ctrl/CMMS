import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../lib/AppError";
import { calculateNextDueDate, DueDateResult } from "../../lib/maintenancePlans";
import { generateWorkOrderFromPlan } from "../../lib/generateWorkOrderFromPlan";
import { AuthPayload } from "../../middlewares/authenticate";
import { MaintenancePeriodicity, WorkOrderStatus } from "../../domain/enums";
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

// generateWorkOrderFromPlan mora em lib/generateWorkOrderFromPlan.ts (usada
// também por workorders/service.ts#autoGenerateNextPreventiveCycle — extraída
// para lib/ para evitar dependência circular entre os dois módulos).

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
    // Fase 4 do "baú" (CLAUDE.md §5.2): por padrão some da Agenda qualquer
    // plano excluído em cascata — só quem passa incluirExcluidos=true (o
    // Baú, Fase 5) vê.
    ...(!query.incluirExcluidos && { excludedAt: null }),
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
