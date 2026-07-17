import { Request, Response } from "express";
import { indicatorsQuerySchema } from "./schema";
import * as indicatorsService from "./service";

export async function overviewController(req: Request, res: Response) {
  const query = indicatorsQuerySchema.parse(req.query);
  res.json(await indicatorsService.getOverview(query));
}

export async function byAssetController(req: Request, res: Response) {
  const query = indicatorsQuerySchema.parse(req.query);
  res.json(await indicatorsService.getByAsset(query));
}

export async function backlogController(req: Request, res: Response) {
  const query = indicatorsQuerySchema.parse(req.query);
  res.json(await indicatorsService.getBacklog(query));
}
