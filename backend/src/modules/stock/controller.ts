import { Request, Response } from "express";
import { stockAdjustSchema, stockEntrySchema, stockReturnSchema } from "./schema";
import * as stockService from "./service";

export async function stockEntryController(req: Request, res: Response) {
  const input = stockEntrySchema.parse(req.body);
  res.status(201).json(await stockService.stockEntry(input, req.user!.userId));
}

export async function stockAdjustController(req: Request, res: Response) {
  const input = stockAdjustSchema.parse(req.body);
  res.status(201).json(await stockService.stockAdjust(input, req.user!.userId));
}

export async function stockReturnController(req: Request, res: Response) {
  const input = stockReturnSchema.parse(req.body);
  res.status(201).json(await stockService.stockReturn(input, req.user!.userId));
}

export async function getPartLedgerController(req: Request, res: Response) {
  res.json(await stockService.getPartLedger(req.params.partId));
}

export async function listLowStockController(_req: Request, res: Response) {
  res.json(await stockService.listLowStockParts());
}

export async function getStockDashboardController(_req: Request, res: Response) {
  res.json(await stockService.getStockDashboard());
}
