import type { Prisma } from "@prisma/client";
import { AppError } from "./AppError";
import { generateWorkOrderNumber } from "./workOrderNumber";
import { resolveAssigneeIds } from "./assignees";
import { workOrderInclude } from "./workOrderInclude";
import { AuthPayload } from "../middlewares/authenticate";
import { WorkOrderStatus, WorkOrderType } from "../domain/enums";

export interface GenerateWorkOrderFromPlanInput {
  scheduledStart: Date;
  scheduledEnd: Date;
  assigneeIds: string[];
}

export interface PlanForWorkOrderGeneration {
  id: string;
  assetId: string;
  discipline: string;
  title: string;
  description: string | null;
  priority: string;
  estimatedHours: Prisma.Decimal | null;
  active: boolean;
}

// Núcleo compartilhado de "criar plano" (1º ciclo, maintenance-plans/service.ts),
// "gerar OS" manual (ciclos seguintes, mesmo arquivo) e da geração automática
// no encerramento de um ciclo (workorders/service.ts#autoGenerateNextPreventiveCycle).
// Extraído para lib/ (em vez de morar em um dos dois módulos) para evitar
// dependência circular entre eles — ambos importam daqui, nenhum importa do
// outro. Cria a WorkOrder já PROGRAMADA, vinculada ao plano, com o
// responsável principal + apoio vindos de assigneeIds (mesmo padrão de
// programacao() em workorders/service.ts). Não passa por
// canTransition/applyTransition — atalho deliberado, mesmo espírito de
// timelineOverride: quem agenda a preventiva já forneceu data/hora e
// técnico, não faz sentido exigir triagem/planejamento manuais depois.
export async function generateWorkOrderFromPlan(
  tx: Prisma.TransactionClient,
  plan: PlanForWorkOrderGeneration,
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
