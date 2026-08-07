import { Request, Response } from "express";
import { AppError } from "../../lib/AppError";
import { patchRespostaSchema, patchStatusSchema } from "./schema";
import * as ptService from "./service";

function requireUser(req: Request) {
  if (!req.user) {
    throw new AppError(401, "UNAUTHENTICATED", "Token de autenticação ausente.");
  }
  return req.user;
}

export async function getPermissaoTrabalhoController(req: Request, res: Response) {
  res.json(await ptService.getByWorkOrderId(req.params.workOrderId));
}

export async function patchRespostaController(req: Request, res: Response) {
  const input = patchRespostaSchema.parse(req.body);
  res.json(await ptService.patchResposta(req.params.id, input));
}

export async function patchStatusController(req: Request, res: Response) {
  const input = patchStatusSchema.parse(req.body);
  res.json(await ptService.patchStatus(req.params.id, input, requireUser(req)));
}
