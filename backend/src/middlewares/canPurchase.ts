import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { AppError } from "../lib/AppError";

// Permissão de acessar a fila de compras NÃO é role — é a flag
// canPurchase no User. O JWT só carrega userId/role (ver
// middlewares/authenticate.ts), então é preciso consultar o banco aqui.
export async function assertCanPurchase(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { canPurchase: true },
  });

  if (!user?.canPurchase) {
    throw new AppError(403, "FORBIDDEN", "Usuário não está habilitado a comprar.");
  }
}

export function canPurchase() {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new AppError(401, "UNAUTHENTICATED", "Token de autenticação ausente."));
      return;
    }

    assertCanPurchase(req.user.userId)
      .then(() => next())
      .catch(next);
  };
}
