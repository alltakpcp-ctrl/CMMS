import { Request, Response } from "express";
import { loginSchema } from "./schema";
import * as authService from "./service";
import { AppError } from "../../lib/AppError";

export async function loginController(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);
  const result = await authService.login(input);
  res.json(result);
}

export async function meController(req: Request, res: Response) {
  if (!req.user) {
    throw new AppError(401, "UNAUTHENTICATED", "Token de autenticação ausente.");
  }
  const user = await authService.getMe(req.user.userId);
  res.json(user);
}
