import { Request, Response } from "express";
import { createUserSchema, updateUserSchema } from "./schema";
import * as usersService from "./service";

export async function listUsersController(_req: Request, res: Response) {
  res.json(await usersService.listUsers());
}

export async function createUserController(req: Request, res: Response) {
  const input = createUserSchema.parse(req.body);
  res.status(201).json(await usersService.createUser(input));
}

export async function updateUserController(req: Request, res: Response) {
  const input = updateUserSchema.parse(req.body);
  res.json(await usersService.updateUser(req.params.id, input));
}
