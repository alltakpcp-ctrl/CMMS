import { Request, Response } from "express";
import { AppError } from "../../lib/AppError";
import { patchRespostaSchema, patchStatusSchema, solicitarAssinaturaSchema } from "./schema";
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
  res.json(await ptService.patchResposta(req.params.id, input, requireUser(req)));
}

export async function patchStatusController(req: Request, res: Response) {
  const input = patchStatusSchema.parse(req.body);
  res.json(await ptService.patchStatus(req.params.id, input, requireUser(req)));
}

export async function checkpointController(req: Request, res: Response) {
  res.json(await ptService.checkpoint(req.params.id, requireUser(req)));
}

export async function solicitarAssinaturaController(req: Request, res: Response) {
  const input = solicitarAssinaturaSchema.parse(req.body);
  const assinatura = await ptService.solicitarAssinatura(req.params.ptId, input.userId, requireUser(req));
  res.status(201).json(assinatura);
}

export async function removerAssinaturaController(req: Request, res: Response) {
  res.json(await ptService.removerAssinatura(req.params.assinaturaId, requireUser(req)));
}

export async function assinarController(req: Request, res: Response) {
  res.json(await ptService.assinar(req.params.assinaturaId, requireUser(req)));
}

export async function minhasPendenciasController(req: Request, res: Response) {
  res.json(await ptService.listarMinhasPendencias(requireUser(req)));
}

export async function listarAguardandoAprovacaoController(_req: Request, res: Response) {
  res.json(await ptService.listarAguardandoAprovacao());
}
