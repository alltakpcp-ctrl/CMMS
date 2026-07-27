import { Request, Response } from "express";
import { createSectorSchema, updateSectorSchema } from "./schema";
import * as sectorsService from "./service";

export async function listSectorsController(_req: Request, res: Response) {
  res.json(await sectorsService.listActiveSectors());
}

export async function createSectorController(req: Request, res: Response) {
  const input = createSectorSchema.parse(req.body);
  res.status(201).json(await sectorsService.createSector(input));
}

export async function updateSectorController(req: Request, res: Response) {
  const input = updateSectorSchema.parse(req.body);
  res.json(await sectorsService.updateSector(req.params.id, input));
}

export async function deleteSectorController(req: Request, res: Response) {
  await sectorsService.deleteSector(req.params.id);
  res.status(204).send();
}
