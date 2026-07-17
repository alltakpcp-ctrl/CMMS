import bcrypt from "bcrypt";
import { prisma } from "../../config/prisma";
import { AppError } from "../../lib/AppError";
import { publicUserSelect } from "../../lib/publicUser";
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

export async function updateUser(id: string, input: UpdateUserInput) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError(404, "USER_NOT_FOUND", "Usuário não encontrado.");
  }

  return prisma.user.update({
    where: { id },
    data: { name: input.name, role: input.role, active: input.active },
    select: publicUserSelect,
  });
}
