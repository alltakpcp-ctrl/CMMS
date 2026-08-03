import { Request, Response } from "express";
import { AppError } from "../../lib/AppError";
import { changePasswordSchema, createUserSchema, listTecnicosQuerySchema, updateUserSchema } from "./schema";
import * as usersService from "./service";

export async function listUsersController(_req: Request, res: Response) {
  res.json(await usersService.listUsers());
}

export async function listTecnicosController(req: Request, res: Response) {
  const query = listTecnicosQuerySchema.parse(req.query);
  res.json(await usersService.listTecnicos(query.excludeUserId));
}

export async function listAssignableForSubtaskController(req: Request, res: Response) {
  const query = listTecnicosQuerySchema.parse(req.query);
  res.json(await usersService.listAssignableForSubtask(query.excludeUserId));
}

export async function createUserController(req: Request, res: Response) {
  const input = createUserSchema.parse(req.body);
  res.status(201).json(await usersService.createUser(input));
}

export async function updateUserController(req: Request, res: Response) {
  if (!req.user) {
    throw new AppError(401, "UNAUTHENTICATED", "Token de autenticação ausente.");
  }
  const input = updateUserSchema.parse(req.body);
  res.json(await usersService.updateUser(req.params.id, input, req.user.userId));
}

export async function changePasswordController(req: Request, res: Response) {
  const input = changePasswordSchema.parse(req.body);
  res.json(await usersService.setUserPassword(req.params.id, input.password));
}

export async function deleteUserController(req: Request, res: Response) {
  if (!req.user) {
    throw new AppError(401, "UNAUTHENTICATED", "Token de autenticação ausente.");
  }
  await usersService.deleteUser(req.params.id, req.user.userId);
  res.status(204).send();
}
