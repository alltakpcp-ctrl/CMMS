import { Request, Response } from "express";
import { AppError } from "../../lib/AppError";
import {
  createMaintenancePlanSchema,
  generateWorkOrderFromPlanSchema,
  listMaintenancePlansQuerySchema,
  updateMaintenancePlanSchema,
} from "./schema";
import * as maintenancePlansService from "./service";

function requireUser(req: Request) {
  if (!req.user) {
    throw new AppError(401, "UNAUTHENTICATED", "Token de autenticação ausente.");
  }
  return req.user;
}

export async function listMaintenancePlansController(req: Request, res: Response) {
  const query = listMaintenancePlansQuerySchema.parse(req.query);
  res.json(await maintenancePlansService.listMaintenancePlans(query));
}

export async function getMaintenancePlanController(req: Request, res: Response) {
  res.json(await maintenancePlansService.getMaintenancePlanById(req.params.id));
}

export async function createMaintenancePlanController(req: Request, res: Response) {
  const input = createMaintenancePlanSchema.parse(req.body);
  const result = await maintenancePlansService.createMaintenancePlan(input, requireUser(req));
  res.status(201).json(result);
}

export async function updateMaintenancePlanController(req: Request, res: Response) {
  const input = updateMaintenancePlanSchema.parse(req.body);
  res.json(await maintenancePlansService.updateMaintenancePlan(req.params.id, input));
}

export async function deleteMaintenancePlanController(req: Request, res: Response) {
  await maintenancePlansService.deleteMaintenancePlan(req.params.id);
  res.status(204).send();
}

export async function generateWorkOrderFromPlanController(req: Request, res: Response) {
  const input = generateWorkOrderFromPlanSchema.parse(req.body);
  const workOrder = await maintenancePlansService.generateWorkOrderFromExistingPlan(
    req.params.id,
    input,
    requireUser(req)
  );
  res.status(201).json(workOrder);
}
