import { Request, Response } from "express";
import { AppError } from "../../lib/AppError";
import * as workOrdersService from "./service";
import {
  cancelarSchema,
  createWorkOrderSchema,
  encerramentoTecnicoSchema,
  iniciarSchema,
  listWorkOrdersQuerySchema,
  planejamentoSchema,
  programacaoSchema,
  registrarSchema,
  reprogramacaoSchema,
  timelineOverrideSchema,
  triagemSchema,
  validarSchema,
} from "./schema";

function requireUser(req: Request) {
  if (!req.user) {
    throw new AppError(401, "UNAUTHENTICATED", "Token de autenticação ausente.");
  }
  return req.user;
}

export async function createWorkOrderController(req: Request, res: Response) {
  const input = createWorkOrderSchema.parse(req.body);
  const workOrder = await workOrdersService.createWorkOrder(input, requireUser(req));
  res.status(201).json(workOrder);
}

export async function listWorkOrdersController(req: Request, res: Response) {
  const query = listWorkOrdersQuerySchema.parse(req.query);
  res.json(await workOrdersService.listWorkOrders(query, requireUser(req)));
}

export async function getWorkOrderController(req: Request, res: Response) {
  res.json(await workOrdersService.getWorkOrderById(req.params.id, requireUser(req)));
}

export async function triagemController(req: Request, res: Response) {
  const input = triagemSchema.parse(req.body);
  res.json(await workOrdersService.triagem(req.params.id, input, requireUser(req)));
}

export async function planejamentoController(req: Request, res: Response) {
  const input = planejamentoSchema.parse(req.body);
  res.json(await workOrdersService.planejamento(req.params.id, input, requireUser(req)));
}

export async function programacaoController(req: Request, res: Response) {
  const input = programacaoSchema.parse(req.body);
  res.json(await workOrdersService.programacao(req.params.id, input, requireUser(req)));
}

export async function reprogramacaoController(req: Request, res: Response) {
  const input = reprogramacaoSchema.parse(req.body);
  res.json(await workOrdersService.reprogramacao(req.params.id, input, requireUser(req)));
}

export async function iniciarController(req: Request, res: Response) {
  const input = iniciarSchema.parse(req.body);
  res.json(await workOrdersService.iniciar(req.params.id, input, requireUser(req)));
}

export async function registrarController(req: Request, res: Response) {
  const input = registrarSchema.parse(req.body);
  res.json(await workOrdersService.registrar(req.params.id, input, requireUser(req)));
}

export async function encerramentoTecnicoController(req: Request, res: Response) {
  const input = encerramentoTecnicoSchema.parse(req.body);
  res.json(await workOrdersService.encerramentoTecnico(req.params.id, input, requireUser(req)));
}

export async function validarController(req: Request, res: Response) {
  const input = validarSchema.parse(req.body);
  res.json(await workOrdersService.validar(req.params.id, input, requireUser(req)));
}

export async function cancelarController(req: Request, res: Response) {
  const input = cancelarSchema.parse(req.body);
  res.json(await workOrdersService.cancelar(req.params.id, input, requireUser(req)));
}

export async function timelineOverrideController(req: Request, res: Response) {
  const input = timelineOverrideSchema.parse(req.body);
  res.json(await workOrdersService.timelineOverride(req.params.id, input, requireUser(req)));
}
