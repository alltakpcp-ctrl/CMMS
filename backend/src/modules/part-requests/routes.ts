import { Router } from "express";
import { Role } from "../../domain/enums";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { asyncHandler } from "../../lib/asyncHandler";
import {
  createPartRequestController,
  getPartRequestController,
  listPartRequestsController,
} from "./controller";

export const partRequestsRoutes = Router();

partRequestsRoutes.use(authenticate);

partRequestsRoutes.post(
  "/",
  authorize(Role.TECNICO, Role.SUPERVISOR),
  asyncHandler(createPartRequestController)
);
// scope=pending exige canReceivePartRequests (checado no controller, não é role)
partRequestsRoutes.get("/", asyncHandler(listPartRequestsController));
partRequestsRoutes.get("/:id", asyncHandler(getPartRequestController));
