import { Router } from "express";
import { Role } from "../../domain/enums";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
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
partsRoutes.post("/", authorize(Role.SUPERVISOR), asyncHandler(createPartController));
partsRoutes.put("/:id", authorize(Role.SUPERVISOR), asyncHandler(updatePartController));
partsRoutes.delete("/:id", authorize(Role.SUPERVISOR), asyncHandler(deletePartController));
