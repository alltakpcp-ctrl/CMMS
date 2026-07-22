import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { AppError } from "../lib/AppError";

// Permissão de montar/gerir pedido de compra NÃO é role — é a flag
// canReceivePartRequests no User. O JWT só carrega userId/role (ver
// middlewares/authenticate.ts), então é preciso consultar o banco aqui.
export async function assertCanReceivePartRequests(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { canReceivePartRequests: true },
  });

  if (!user?.canReceivePartRequests) {
    throw new AppError(403, "FORBIDDEN", "Usuário não está habilitado a receber pedidos de peça.");
  }
}

export function canReceivePartRequests() {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new AppError(401, "UNAUTHENTICATED", "Token de autenticação ausente."));
      return;
    }

    assertCanReceivePartRequests(req.user.userId)
      .then(() => next())
      .catch(next);
  };
}
