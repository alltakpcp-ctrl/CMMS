import { Router } from "express";
import { Role } from "../../domain/enums";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { asyncHandler } from "../../lib/asyncHandler";
import {
  createMaintenancePlanController,
  deleteMaintenancePlanController,
  excluirMaintenancePlanController,
  generateWorkOrderFromPlanController,
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
// Criar um plano gera a 1ª OS na hora — por isso TECNICO também pode criar
// (não só SUPERVISOR), já que é quem tipicamente identifica a necessidade da
// preventiva em campo. Editar/desativar/excluir o plano continua SUPERVISOR-only.
maintenancePlansRoutes.post(
  "/",
  authorize(Role.TECNICO, Role.SUPERVISOR),
  asyncHandler(createMaintenancePlanController)
);
maintenancePlansRoutes.patch("/:id", authorize(Role.SUPERVISOR), asyncHandler(updateMaintenancePlanController));
maintenancePlansRoutes.delete("/:id", authorize(Role.SUPERVISOR), asyncHandler(deleteMaintenancePlanController));
// Exclusão lógica (§5.2 do CLAUDE.md) — ao contrário do DELETE acima (hard
// delete, só funciona com zero OS vinculada), funciona com o plano em
// qualquer estado e mata junto toda OS não-ENCERRADA vinculada a ele.
maintenancePlansRoutes.post(
  "/:id/excluir",
  authorize(Role.SUPERVISOR),
  asyncHandler(excluirMaintenancePlanController)
);
// Gera um novo ciclo de OS a partir de um plano já existente (ex.: venceu de
// novo após a OS anterior ser ENCERRADA). Mesma permissão de criar plano.
maintenancePlansRoutes.post(
  "/:id/gerar-os",
  authorize(Role.TECNICO, Role.SUPERVISOR),
  asyncHandler(generateWorkOrderFromPlanController)
);
