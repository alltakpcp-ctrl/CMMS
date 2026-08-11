import { Router } from "express";
import { Role } from "../../domain/enums";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { asyncHandler } from "../../lib/asyncHandler";
import {
  getPermissaoTrabalhoController,
  patchRespostaController,
  patchStatusController,
  checkpointController,
  solicitarAssinaturaController,
  removerAssinaturaController,
  assinarController,
  minhasPendenciasController,
} from "./controller";

export const permissaoTrabalhoRoutes = Router();

permissaoTrabalhoRoutes.use(authenticate);

// estáticas antes de dinâmicas
permissaoTrabalhoRoutes.get("/workorder/:workOrderId", asyncHandler(getPermissaoTrabalhoController));
permissaoTrabalhoRoutes.patch("/respostas/:id", asyncHandler(patchRespostaController));
permissaoTrabalhoRoutes.get("/assinaturas/minhas-pendencias", asyncHandler(minhasPendenciasController));
permissaoTrabalhoRoutes.delete(
  "/assinaturas/:assinaturaId",
  authorize(Role.SUPERVISOR),
  asyncHandler(removerAssinaturaController)
);
permissaoTrabalhoRoutes.post("/assinaturas/:assinaturaId/assinar", asyncHandler(assinarController));
permissaoTrabalhoRoutes.patch("/:id/status", asyncHandler(patchStatusController));
permissaoTrabalhoRoutes.post("/:id/checkpoint", asyncHandler(checkpointController));
permissaoTrabalhoRoutes.post(
  "/:ptId/assinaturas",
  authorize(Role.SUPERVISOR),
  asyncHandler(solicitarAssinaturaController)
);
