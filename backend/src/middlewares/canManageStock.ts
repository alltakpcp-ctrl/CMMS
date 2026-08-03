import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { AppError } from "../lib/AppError";
import { Role } from "../domain/enums";

// Supervisor tem acesso irrestrito; senão, exige a flag canManageStock no User.
// JWT só carrega userId/role (ver middlewares/authenticate.ts), então é
// preciso consultar o banco aqui — mesma mecânica de canReceivePartRequests.ts.
export function supervisorOrCanManageStock() {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new AppError(401, "UNAUTHENTICATED", "Token de autenticação ausente."));
      return;
    }

    if (req.user.role === Role.SUPERVISOR) {
      next();
      return;
    }

    prisma.user
      .findUnique({ where: { id: req.user.userId }, select: { canManageStock: true } })
      .then((user) => {
        if (!user?.canManageStock) {
          next(new AppError(403, "FORBIDDEN", "Usuário não habilitado a movimentar estoque."));
          return;
        }
        next();
      })
      .catch(next);
  };
}
