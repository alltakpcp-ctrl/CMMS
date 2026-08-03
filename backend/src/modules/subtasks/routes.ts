import { Router } from "express";
import { Role } from "../../domain/enums";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { asyncHandler } from "../../lib/asyncHandler";
import {
  cancelSubtaskController,
  createSubtaskController,
  finishSubtaskController,
  listSubtasksController,
  updateSubtaskController,
} from "./controller";

// Aninhado sob /workorders/:workOrderId/subtasks — montado em app.ts junto
// com workOrdersRoutes (mesmo prefixo "/workorders").
export const subtaskNestedRoutes = Router();

subtaskNestedRoutes.use(authenticate);

subtaskNestedRoutes.get(
  "/:workOrderId/subtasks",
  authorize(Role.TECNICO, Role.SUPERVISOR),
  asyncHandler(listSubtasksController)
);
subtaskNestedRoutes.post(
  "/:workOrderId/subtasks",
  authorize(Role.TECNICO, Role.SUPERVISOR),
  asyncHandler(createSubtaskController)
);

// Operações por id da própria subtask — montado em "/subtasks". Ownership
// (dono ou SUPERVISOR) é checado no service, não aqui, pois depende do
// assignedToId da subtask, não do papel do usuário.
export const subtaskRoutes = Router();

subtaskRoutes.use(authenticate);

subtaskRoutes.patch(
  "/:id",
  authorize(Role.TECNICO, Role.SUPERVISOR),
  asyncHandler(updateSubtaskController)
);
subtaskRoutes.post(
  "/:id/finish",
  authorize(Role.TECNICO, Role.SUPERVISOR),
  asyncHandler(finishSubtaskController)
);
subtaskRoutes.post(
  "/:id/cancel",
  authorize(Role.TECNICO, Role.SUPERVISOR),
  asyncHandler(cancelSubtaskController)
);
