import { Router } from "express";
import { Role } from "../../domain/enums";
import {
  changePasswordController,
  createUserController,
  deleteUserController,
  listAssignableForSubtaskController,
  listTecnicosController,
  listUsersController,
  updateUserController,
} from "./controller";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { asyncHandler } from "../../lib/asyncHandler";

export const usersRoutes = Router();

// Lista de apoio para seleção de manutentores — liberada também para TECNICO
// (diferente do CRUD de usuários abaixo, exclusivo de SUPERVISOR). Precisa
// ficar registrada antes do usersRoutes.use(authorize(SUPERVISOR)) global.
usersRoutes.get(
  "/tecnicos",
  authenticate,
  authorize(Role.TECNICO, Role.SUPERVISOR),
  asyncHandler(listTecnicosController)
);

// Lista de apoio para atribuir/reatribuir subtarefas (TECNICO + SUPERVISOR
// ativos) — mesma exceção do /tecnicos acima, registrada antes do gate global
// de SUPERVISOR, senão TECNICO receberia 403.
usersRoutes.get(
  "/assignable-subtask",
  authenticate,
  authorize(Role.TECNICO, Role.SUPERVISOR),
  asyncHandler(listAssignableForSubtaskController)
);

usersRoutes.use(authenticate, authorize(Role.SUPERVISOR));

usersRoutes.get("/", asyncHandler(listUsersController));
usersRoutes.post("/", asyncHandler(createUserController));
usersRoutes.put("/:id", asyncHandler(updateUserController));
usersRoutes.post("/:id/senha", asyncHandler(changePasswordController));
usersRoutes.delete("/:id", asyncHandler(deleteUserController));
