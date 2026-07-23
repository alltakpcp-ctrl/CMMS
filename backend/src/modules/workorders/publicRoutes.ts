import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { listPublicOpenWorkOrdersController } from "./publicController";

// Router público — SEM authenticate. Expõe só o necessário para o quadro de
// novas solicitações na tela de login (ver publicController.ts para o select).
export const publicWorkOrdersRoutes = Router();

publicWorkOrdersRoutes.get("/", asyncHandler(listPublicOpenWorkOrdersController));
