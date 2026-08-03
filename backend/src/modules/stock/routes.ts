import { Router } from "express";
import { Role } from "../../domain/enums";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { supervisorOrCanManageStock } from "../../middlewares/canManageStock";
import { asyncHandler } from "../../lib/asyncHandler";
import {
  getPartLedgerController,
  listLowStockController,
  stockAdjustController,
  stockEntryController,
  stockReturnController,
} from "./controller";

export const stockRoutes = Router();

stockRoutes.use(authenticate);

stockRoutes.post("/entry", supervisorOrCanManageStock(), asyncHandler(stockEntryController));
stockRoutes.post("/adjust", supervisorOrCanManageStock(), asyncHandler(stockAdjustController));
stockRoutes.post("/return", supervisorOrCanManageStock(), asyncHandler(stockReturnController));
stockRoutes.get(
  "/low-stock",
  authorize(Role.TECNICO, Role.SUPERVISOR),
  asyncHandler(listLowStockController)
);
stockRoutes.get(
  "/ledger/:partId",
  authorize(Role.TECNICO, Role.SUPERVISOR),
  asyncHandler(getPartLedgerController)
);
