import { prisma } from "../../config/prisma";
import { AppError } from "../../lib/AppError";
import { AuthPayload } from "../../middlewares/authenticate";
import { Role } from "../../domain/enums";
import { CreateSubtaskInput, UpdateSubtaskInput } from "./schema";

// Dono (assignedToId) ou SUPERVISOR podem escrever; TECNICO fora da subtask é bloqueado.
function assertOwnerOrSupervisor(subtask: { assignedToId: string }, user: AuthPayload) {
  if (user.role !== Role.SUPERVISOR && subtask.assignedToId !== user.userId) {
    throw new AppError(403, "SUBTASK_FORBIDDEN", "Você só pode alterar subtarefas atribuídas a você.");
  }
}

async function getOpenSubtaskOrThrow(id: string) {
  const subtask = await prisma.subtask.findUnique({ where: { id } });
  if (!subtask) {
    throw new AppError(404, "SUBTASK_NOT_FOUND", "Subtarefa não encontrada.");
  }
  if (subtask.status !== "ABERTA") {
    throw new AppError(409, "SUBTASK_NOT_OPEN", "Esta subtarefa não está mais aberta.");
  }
  return subtask;
}

// Mesma validação usada para manutentores de apoio da OS (resolveAssigneeIds
// em workorders/service.ts): impede pendurar uma subtask em usuário inativo
// ou OPERADOR, o que travaria a OS para sempre (só o dono ou SUPERVISOR fecham).
async function assertValidAssignee(assignedToId: string) {
  const user = await prisma.user.findUnique({
    where: { id: assignedToId },
    select: { role: true, active: true },
  });
  if (!user || !user.active || user.role === Role.OPERADOR) {
    throw new AppError(
      422,
      "INVALID_ASSIGNEE",
      "Responsável pela subtarefa deve ser um usuário TECNICO ou SUPERVISOR ativo."
    );
  }
}

export function listSubtasks(workOrderId: string) {
  return prisma.subtask.findMany({ where: { workOrderId }, orderBy: { createdAt: "asc" } });
}

export async function createSubtask(workOrderId: string, input: CreateSubtaskInput, user: AuthPayload) {
  const workOrder = await prisma.workOrder.findUnique({ where: { id: workOrderId }, select: { id: true } });
  if (!workOrder) {
    throw new AppError(404, "WORK_ORDER_NOT_FOUND", "Ordem de serviço não encontrada.");
  }

  if (input.assignedToId) {
    await assertValidAssignee(input.assignedToId);
  }

  return prisma.subtask.create({
    data: {
      workOrderId,
      title: input.title,
      description: input.description,
      estimatedMinutes: input.estimatedMinutes,
      createdById: user.userId,
      assignedToId: input.assignedToId ?? user.userId,
    },
  });
}

export async function updateSubtask(id: string, input: UpdateSubtaskInput, user: AuthPayload) {
  const subtask = await getOpenSubtaskOrThrow(id);
  assertOwnerOrSupervisor(subtask, user);

  if (input.assignedToId) {
    await assertValidAssignee(input.assignedToId);
  }

  return prisma.subtask.update({
    where: { id },
    data: {
      title: input.title,
      description: input.description,
      estimatedMinutes: input.estimatedMinutes,
      assignedToId: input.assignedToId,
    },
  });
}

export async function finishSubtask(id: string, user: AuthPayload) {
  const subtask = await getOpenSubtaskOrThrow(id);
  assertOwnerOrSupervisor(subtask, user);

  return prisma.subtask.update({
    where: { id },
    data: { status: "CONCLUIDA", finishedAt: new Date() },
  });
}

export async function cancelSubtask(id: string, user: AuthPayload) {
  const subtask = await getOpenSubtaskOrThrow(id);
  assertOwnerOrSupervisor(subtask, user);

  return prisma.subtask.update({
    where: { id },
    data: { status: "CANCELADA" },
  });
}
