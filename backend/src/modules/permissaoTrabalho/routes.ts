import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { asyncHandler } from "../../lib/asyncHandler";
import {
  getPermissaoTrabalhoController,
  patchRespostaController,
  patchStatusController,
  checkpointController,
} from "./controller";

export const permissaoTrabalhoRoutes = Router();

permissaoTrabalhoRoutes.use(authenticate);

// estáticas antes de dinâmicas
permissaoTrabalhoRoutes.get("/workorder/:workOrderId", asyncHandler(getPermissaoTrabalhoController));
permissaoTrabalhoRoutes.patch("/respostas/:id", asyncHandler(patchRespostaController));
permissaoTrabalhoRoutes.patch("/:id/status", asyncHandler(patchStatusController));
permissaoTrabalhoRoutes.post("/:id/checkpoint", asyncHandler(checkpointController));
