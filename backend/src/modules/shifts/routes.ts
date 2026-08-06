import { Router } from "express";
import { Role } from "../../domain/enums";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { asyncHandler } from "../../lib/asyncHandler";
import { listShiftsController } from "./controller";

export const shiftsRoutes = Router();

// Mesmo gate do CRUD de usuários (usersRoutes.use(authorize(SUPERVISOR))) —
// tela de turnos é consumida apenas pela edição de usuário, exclusiva de SUPERVISOR.
shiftsRoutes.use(authenticate, authorize(Role.SUPERVISOR));

shiftsRoutes.get("/", asyncHandler(listShiftsController));
