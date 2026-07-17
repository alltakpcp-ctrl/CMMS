import { Request, Response } from "express";
import { createAssetSchema, updateAssetSchema } from "./schema";
import * as assetsService from "./service";

export async function listAssetsController(_req: Request, res: Response) {
  res.json(await assetsService.listAssets());
}

export async function getAssetController(req: Request, res: Response) {
  res.json(await assetsService.getAssetById(req.params.id));
}

export async function createAssetController(req: Request, res: Response) {
  const input = createAssetSchema.parse(req.body);
  res.status(201).json(await assetsService.createAsset(input));
}

export async function updateAssetController(req: Request, res: Response) {
  const input = updateAssetSchema.parse(req.body);
  res.json(await assetsService.updateAsset(req.params.id, input));
}

export async function deleteAssetController(req: Request, res: Response) {
  await assetsService.deleteAsset(req.params.id);
  res.status(204).send();
}
