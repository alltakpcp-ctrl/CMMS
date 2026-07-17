import { Request, Response } from "express";
import { createPartSchema, updatePartSchema } from "./schema";
import * as partsService from "./service";

export async function listPartsController(_req: Request, res: Response) {
  res.json(await partsService.listParts());
}

export async function getPartController(req: Request, res: Response) {
  res.json(await partsService.getPartById(req.params.id));
}

export async function createPartController(req: Request, res: Response) {
  const input = createPartSchema.parse(req.body);
  res.status(201).json(await partsService.createPart(input));
}

export async function updatePartController(req: Request, res: Response) {
  const input = updatePartSchema.parse(req.body);
  res.json(await partsService.updatePart(req.params.id, input));
}

export async function deletePartController(req: Request, res: Response) {
  await partsService.deletePart(req.params.id);
  res.status(204).send();
}
