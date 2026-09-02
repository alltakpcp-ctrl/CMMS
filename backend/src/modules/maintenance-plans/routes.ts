import { Router } from "express";
import { Role } from "../../domain/enums";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { asyncHandler } from "../../lib/asyncHandler";
import {
  createMaintenancePlanController,
  deleteMaintenancePlanController,
  getMaintenancePlanController,
  listMaintenancePlansController,
  updateMaintenancePlanController,
} from "./controller";

export const maintenancePlansRoutes = Router();

maintenancePlansRoutes.use(authenticate);

maintenancePlansRoutes.get(
  "/",
  authorize(Role.TECNICO, Role.SUPERVISOR),
  asyncHandler(listMaintenancePlansController)
);
maintenancePlansRoutes.get(
  "/:id",
  authorize(Role.TECNICO, Role.SUPERVISOR),
  asyncHandler(getMaintenancePlanController)
);
maintenancePlansRoutes.post("/", authorize(Role.SUPERVISOR), asyncHandler(createMaintenancePlanController));
maintenancePlansRoutes.patch("/:id", authorize(Role.SUPERVISOR), asyncHandler(updateMaintenancePlanController));
maintenancePlansRoutes.delete("/:id", authorize(Role.SUPERVISOR), asyncHandler(deleteMaintenancePlanController));
