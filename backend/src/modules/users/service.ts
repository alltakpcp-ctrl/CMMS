import bcrypt from "bcrypt";
import { prisma } from "../../config/prisma";
import { AppError } from "../../lib/AppError";
import { publicUserSelect } from "../../lib/publicUser";
import { assertActiveSector } from "../../lib/sectors";
import { CreateUserInput, UpdateUserInput } from "./schema";

export async function listUsers() {
  return prisma.user.findMany({ select: publicUserSelect, orderBy: { name: "asc" } });
}

export async function createUser(input: CreateUserInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AppError(409, "EMAIL_IN_USE", "Já existe um usuário com este e-mail.");
  }

  const passwordHash = await bcrypt.hash(input.password, 10);

  return prisma.user.create({
    data: { name: input.name, email: input.email, role: input.role, passwordHash },
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

  if (input.sectorId) {
    await assertActiveSector(prisma, input.sectorId);
  }

  return prisma.user.update({
    where: { id },
    data: {
      name: input.name,
      role: input.role,
      active: input.active,
      sectorId: input.sectorId,
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
