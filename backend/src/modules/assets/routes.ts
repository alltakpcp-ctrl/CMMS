import { Router } from "express";
import { Role } from "../../domain/enums";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { asyncHandler } from "../../lib/asyncHandler";
import {
  createAssetController,
  deleteAssetController,
  getAssetController,
  listAssetsController,
  updateAssetController,
} from "./controller";

export const assetsRoutes = Router();

assetsRoutes.use(authenticate);

assetsRoutes.get("/", asyncHandler(listAssetsController));
assetsRoutes.get("/:id", asyncHandler(getAssetController));
assetsRoutes.post("/", authorize(Role.SUPERVISOR), asyncHandler(createAssetController));
assetsRoutes.put("/:id", authorize(Role.SUPERVISOR), asyncHandler(updateAssetController));
assetsRoutes.delete("/:id", authorize(Role.SUPERVISOR), asyncHandler(deleteAssetController));
