import bcrypt from "bcrypt";
import { prisma } from "../../config/prisma";
import { AppError } from "../../lib/AppError";
import { publicUserSelect } from "../../lib/publicUser";
import { assertActiveSector } from "../../lib/sectors";
import { Role } from "../../domain/enums";
import { CreateUserInput, UpdateUserInput } from "./schema";

export async function listUsers() {
  return prisma.user.findMany({ select: publicUserSelect, orderBy: { name: "asc" } });
}

// Lista restrita a TECNICO ativo — usada para popular a seleção de
// manutentores de apoio (planejamento/iniciar), inclusive por TECNICO,
// diferente de listUsers (CRUD completo, exclusivo de SUPERVISOR).
export async function listTecnicos(excludeUserId?: string) {
  return prisma.user.findMany({
    where: {
      role: Role.TECNICO,
      active: true,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: publicUserSelect,
    orderBy: { name: "asc" },
  });
}

// Lista de TECNICO + SUPERVISOR ativos — usada para atribuir/reatribuir
// subtarefas (dono pode ser qualquer um dos dois papéis, diferente de
// listTecnicos, restrita a TECNICO).
export async function listAssignableForSubtask(excludeUserId?: string) {
  return prisma.user.findMany({
    where: {
      role: { in: [Role.TECNICO, Role.SUPERVISOR] },
      active: true,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: publicUserSelect,
    orderBy: { name: "asc" },
  });
}

export async function createUser(input: CreateUserInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AppError(409, "EMAIL_IN_USE", "Já existe um usuário com este e-mail.");
  }

  if (input.role === Role.OPERADOR && !input.sectorId) {
    throw new AppError(400, "OPERATOR_REQUIRES_SECTOR", "Setor é obrigatório para operador.");
  }

  const sectorId = input.role === Role.OPERADOR ? input.sectorId! : null;
  if (sectorId) {
    await assertActiveSector(prisma, sectorId);
  }

  const passwordHash = await bcrypt.hash(input.password, 10);

  return prisma.user.create({
    data: { name: input.name, email: input.email, role: input.role, passwordHash, sectorId },
    select: publicUserSelect,
  });
}

export async function updateUser(id: string, input: UpdateUserInput, actingUserId: string) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError(404, "USER_NOT_FOUND", "Usuário não encontrado.");
  }

  if (input.role !== undefined && id === actingUserId && input.role !== existing.role) {
    throw new AppError(403, "CANNOT_CHANGE_OWN_ROLE", "Você não pode alterar o próprio perfil.");
  }

  if (input.active === false && id === actingUserId) {
    throw new AppError(403, "CANNOT_DEACTIVATE_SELF", "Você não pode desativar o próprio usuário.");
  }

  if (input.email !== undefined && input.email !== existing.email) {
    const existingEmail = await prisma.user.findUnique({ where: { email: input.email } });
    if (existingEmail && existingEmail.id !== id) {
      throw new AppError(409, "EMAIL_IN_USE", "Já existe um usuário com este e-mail.");
    }
  }

  const resultingRole = input.role ?? existing.role;
  let sectorId: string | null;
  if (resultingRole === Role.OPERADOR) {
    sectorId = input.sectorId !== undefined ? input.sectorId : existing.sectorId;
    if (!sectorId) {
      throw new AppError(400, "OPERATOR_REQUIRES_SECTOR", "Setor é obrigatório para operador.");
    }
    await assertActiveSector(prisma, sectorId);
  } else {
    sectorId = null;
  }

  return prisma.user.update({
    where: { id },
    data: {
      name: input.name,
      email: input.email,
      role: input.role,
      active: input.active,
      sectorId,
      canReceivePartRequests: input.canReceivePartRequests,
      canManageStock: input.canManageStock,
      canPurchase: input.canPurchase,
    },
    select: publicUserSelect,
  });
}

export async function deleteUser(id: string, actingUserId: string) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError(404, "USER_NOT_FOUND", "Usuário não encontrado.");
  }

  if (id === actingUserId) {
    throw new AppError(400, "CANNOT_DELETE_SELF", "Você não pode excluir o próprio usuário.");
  }

  const [
    workOrdersRequested,
    workOrdersAssigned,
    workOrdersPriorityAdjusted,
    statusChanges,
    partRequestsCreated,
    purchaseOrdersCreated,
    purchaseOrdersReviewed,
  ] = await Promise.all([
    prisma.workOrder.count({ where: { requesterId: id } }),
    prisma.workOrder.count({ where: { assignedToId: id } }),
    prisma.workOrder.count({ where: { priorityAdjustedById: id } }),
    prisma.statusHistory.count({ where: { changedById: id } }),
    prisma.partRequest.count({ where: { requestedById: id } }),
    prisma.purchaseOrder.count({ where: { createdById: id } }),
    prisma.purchaseOrder.count({ where: { reviewedById: id } }),
  ]);

  const hasHistory =
    workOrdersRequested > 0 ||
    workOrdersAssigned > 0 ||
    workOrdersPriorityAdjusted > 0 ||
    statusChanges > 0 ||
    partRequestsCreated > 0 ||
    purchaseOrdersCreated > 0 ||
    purchaseOrdersReviewed > 0;

  if (hasHistory) {
    throw new AppError(
      409,
      "USER_HAS_HISTORY",
      "Este usuário possui histórico operacional vinculado (OS, pedidos, aprovações ou trocas de status) e não pode ser excluído. Desative o usuário em vez de excluir.",
    );
  }

  await prisma.user.delete({ where: { id } });
}

export async function setUserPassword(id: string, password: string) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError(404, "USER_NOT_FOUND", "Usuário não encontrado.");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  return prisma.user.update({
    where: { id },
    data: { passwordHash },
    select: publicUserSelect,
  });
}
