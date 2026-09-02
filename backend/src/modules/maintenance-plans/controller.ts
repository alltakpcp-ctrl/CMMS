import { Request, Response } from "express";
import {
  createMaintenancePlanSchema,
  listMaintenancePlansQuerySchema,
  updateMaintenancePlanSchema,
} from "./schema";
import * as maintenancePlansService from "./service";

export async function listMaintenancePlansController(req: Request, res: Response) {
  const query = listMaintenancePlansQuerySchema.parse(req.query);
  res.json(await maintenancePlansService.listMaintenancePlans(query));
}

export async function getMaintenancePlanController(req: Request, res: Response) {
  res.json(await maintenancePlansService.getMaintenancePlanById(req.params.id));
}

export async function createMaintenancePlanController(req: Request, res: Response) {
  const input = createMaintenancePlanSchema.parse(req.body);
  res.status(201).json(await maintenancePlansService.createMaintenancePlan(input));
}

export async function updateMaintenancePlanController(req: Request, res: Response) {
  const input = updateMaintenancePlanSchema.parse(req.body);
  res.json(await maintenancePlansService.updateMaintenancePlan(req.params.id, input));
}

export async function deleteMaintenancePlanController(req: Request, res: Response) {
  await maintenancePlansService.deleteMaintenancePlan(req.params.id);
  res.status(204).send();
}
