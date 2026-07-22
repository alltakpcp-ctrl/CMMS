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
      role: input.role,
      active: input.active,
      sectorId,
      canReceivePartRequests: input.canReceivePartRequests,
    },
    select: publicUserSelect,
  });
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
