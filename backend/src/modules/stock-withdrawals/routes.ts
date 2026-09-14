import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { supervisorOrCanManageStock } from "../../middlewares/canManageStock";
import { asyncHandler } from "../../lib/asyncHandler";
import { listPendingStockWithdrawalsController, reviewStockWithdrawalController } from "./controller";

export const stockWithdrawalsRoutes = Router();

stockWithdrawalsRoutes.use(authenticate);

stockWithdrawalsRoutes.get("/", supervisorOrCanManageStock(), asyncHandler(listPendingStockWithdrawalsController));
stockWithdrawalsRoutes.post(
  "/:id/review",
  supervisorOrCanManageStock(),
  asyncHandler(reviewStockWithdrawalController)
);
