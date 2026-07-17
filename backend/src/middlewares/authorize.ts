import { NextFunction, Request, Response } from "express";
import { Role } from "../domain/enums";
import { AppError } from "../lib/AppError";

export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "Token de autenticação ausente.");
    }

    if (!roles.includes(req.user.role)) {
      throw new AppError(403, "FORBIDDEN", "Perfil não autorizado para esta ação.");
    }

    next();
  };
}
