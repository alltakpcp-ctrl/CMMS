import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { AppError } from "../../lib/AppError";
import { LoginInput } from "./schema";

function toPublicUser(user: {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  sectorId: string | null;
  canReceivePartRequests: boolean;
  canManageStock: boolean;
  canPurchase: boolean;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    sectorId: user.sectorId,
    canReceivePartRequests: user.canReceivePartRequests,
    canManageStock: user.canManageStock,
    canPurchase: user.canPurchase,
  };
}

export async function login({ email, password }: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.active) {
    throw new AppError(401, "INVALID_CREDENTIALS", "E-mail ou senha inválidos.");
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    throw new AppError(401, "INVALID_CREDENTIALS", "E-mail ou senha inválidos.");
  }

  const token = jwt.sign(
    { userId: user.id, role: user.role },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn } as SignOptions
  );

  return { token, user: toPublicUser(user) };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "Usuário não encontrado.");
  }

  return toPublicUser(user);
}
