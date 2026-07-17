import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { asyncHandler } from "../../lib/asyncHandler";
import { backlogController, byAssetController, overviewController } from "./controller";

export const indicatorsRoutes = Router();

// Leitura liberada a todos os perfis autenticados (§4 do CLAUDE.md — OPERADOR e
// TECNICO têm acesso de leitura; não há ação de escrita nesta área).
indicatorsRoutes.use(authenticate);

indicatorsRoutes.get("/overview", asyncHandler(overviewController));
indicatorsRoutes.get("/by-asset", asyncHandler(byAssetController));
indicatorsRoutes.get("/backlog", asyncHandler(backlogController));
