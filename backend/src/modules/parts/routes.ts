import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { supervisorOrCanManageStock } from "../../middlewares/canManageStock";
import { asyncHandler } from "../../lib/asyncHandler";
import {
  createPartController,
  deletePartController,
  getPartController,
  listPartsController,
  updatePartController,
} from "./controller";

export const partsRoutes = Router();

partsRoutes.use(authenticate);

partsRoutes.get("/", asyncHandler(listPartsController));
partsRoutes.get("/:id", asyncHandler(getPartController));
partsRoutes.post("/", supervisorOrCanManageStock(), asyncHandler(createPartController));
partsRoutes.put("/:id", supervisorOrCanManageStock(), asyncHandler(updatePartController));
partsRoutes.delete("/:id", supervisorOrCanManageStock(), asyncHandler(deletePartController));
