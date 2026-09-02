import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../lib/AppError";
import { calculateNextDueDate, DueDateResult } from "../../lib/maintenancePlans";
import { MaintenancePeriodicity, WorkOrderStatus } from "../../domain/enums";
import { CreateMaintenancePlanInput, ListMaintenancePlansQuery, UpdateMaintenancePlanInput } from "./schema";

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

export async function createMaintenancePlan(input: CreateMaintenancePlanInput) {
  await assertAssetExists(input.assetId);
  return prisma.maintenancePlan.create({ data: input, include: { asset: true } });
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
  try {
    await prisma.maintenancePlan.delete({ where: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      throw new AppError(
        422,
        "MAINTENANCE_PLAN_HAS_WORK_ORDERS",
        "Plano possui OS vinculadas e não pode ser excluído. Considere desativá-lo (active=false)."
      );
    }
    throw err;
  }
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

  const lastExecutionByPlanId = await lastValidExecutionByPlanId(plans.map((p) => p.id));

  return plans.map((plan) => {
    const lastFinishedAt = lastExecutionByPlanId.get(plan.id) ?? null;
    const dueDate: DueDateResult = calculateNextDueDate(
      { id: plan.id, periodicity: plan.periodicity as MaintenancePeriodicity, createdAt: plan.createdAt },
      lastFinishedAt ? { finishedAt: lastFinishedAt } : null
    );
    return { ...plan, ...dueDate };
  });
}
