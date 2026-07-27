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
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    sectorId: user.sectorId,
    canReceivePartRequests: user.canReceivePartRequests,
  };
}

const EARTH_RADIUS_M = 6371000;

function haversineDistanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function login({ email, password, lat, lng }: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.active) {
    throw new AppError(401, "INVALID_CREDENTIALS", "E-mail ou senha inválidos.");
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    throw new AppError(401, "INVALID_CREDENTIALS", "E-mail ou senha inválidos.");
  }

  if (env.geofenceEnabled) {
    if (lat === undefined || lng === undefined) {
      throw new AppError(403, "GEO_REQUIRED", "Ative a localização do navegador para entrar.");
    }

    const distanceM = haversineDistanceM(lat, lng, env.geofenceLat, env.geofenceLng);
    if (distanceM > env.geofenceRadiusM) {
      throw new AppError(403, "GEO_OUT_OF_RANGE", "Acesso permitido apenas na área autorizada.");
    }
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
