import { Request, Response } from "express";
import { reviewStockWithdrawalSchema } from "./schema";
import * as stockWithdrawalsService from "./service";

export async function listPendingStockWithdrawalsController(_req: Request, res: Response) {
  res.json(await stockWithdrawalsService.listPending());
}

export async function reviewStockWithdrawalController(req: Request, res: Response) {
  const input = reviewStockWithdrawalSchema.parse(req.body);
  res.json(await stockWithdrawalsService.reviewStockWithdrawalRequest(req.params.id, input, req.user!));
}
