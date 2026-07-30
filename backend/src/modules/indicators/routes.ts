import { Router } from "express";
import { Role } from "../../domain/enums";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { asyncHandler } from "../../lib/asyncHandler";
import {
  backlogController,
  byAssetController,
  getDistributionController,
  getLifecycleController,
  getTechnicianEfficiencyController,
  overviewController,
} from "./controller";

export const indicatorsRoutes = Router();

// Fase 3.A: indicadores exigem visão cross-setor (agregam todos os ativos),
// por isso OPERADOR — restrito ao próprio setor — fica de fora. TECNICO e
// SUPERVISOR mantêm acesso de leitura (§4 do CLAUDE.md).
indicatorsRoutes.use(authenticate);
indicatorsRoutes.use(authorize(Role.TECNICO, Role.SUPERVISOR));

indicatorsRoutes.get("/overview", asyncHandler(overviewController));
indicatorsRoutes.get("/by-asset", asyncHandler(byAssetController));
indicatorsRoutes.get("/backlog", asyncHandler(backlogController));
indicatorsRoutes.get("/lifecycle", asyncHandler(getLifecycleController));
indicatorsRoutes.get("/distribution", asyncHandler(getDistributionController));
indicatorsRoutes.get("/technician-efficiency", asyncHandler(getTechnicianEfficiencyController));
