import { Request, Response } from "express";
import { AppError } from "../../lib/AppError";
import * as subtaskService from "./service";
import { createSubtaskSchema, updateSubtaskSchema } from "./schema";

function requireUser(req: Request) {
  if (!req.user) {
    throw new AppError(401, "UNAUTHENTICATED", "Token de autenticação ausente.");
  }
  return req.user;
}

export async function listSubtasksController(req: Request, res: Response) {
  res.json(await subtaskService.listSubtasks(req.params.workOrderId));
}

export async function createSubtaskController(req: Request, res: Response) {
  const input = createSubtaskSchema.parse(req.body);
  const subtask = await subtaskService.createSubtask(req.params.workOrderId, input, requireUser(req));
  res.status(201).json(subtask);
}

export async function updateSubtaskController(req: Request, res: Response) {
  const input = updateSubtaskSchema.parse(req.body);
  res.json(await subtaskService.updateSubtask(req.params.id, input, requireUser(req)));
}

export async function finishSubtaskController(req: Request, res: Response) {
  res.json(await subtaskService.finishSubtask(req.params.id, requireUser(req)));
}

export async function cancelSubtaskController(req: Request, res: Response) {
  res.json(await subtaskService.cancelSubtask(req.params.id, requireUser(req)));
}
