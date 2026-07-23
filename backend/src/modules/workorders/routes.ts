import { Router } from "express";
import { Role } from "../../domain/enums";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { asyncHandler } from "../../lib/asyncHandler";
import {
  cancelarController,
  createWorkOrderController,
  encerramentoTecnicoController,
  getWorkOrderController,
  iniciarController,
  listWorkOrdersController,
  planejamentoController,
  programacaoController,
  registrarController,
  triagemController,
  validarController,
} from "./controller";

export const workOrdersRoutes = Router();

workOrdersRoutes.use(authenticate);

// Etapa 1 — Abertura: OPERADOR e SUPERVISOR. TECNICO não abre OS.
workOrdersRoutes.post(
  "/",
  authorize(Role.OPERADOR, Role.SUPERVISOR),
  asyncHandler(createWorkOrderController)
);
workOrdersRoutes.get("/", asyncHandler(listWorkOrdersController));
workOrdersRoutes.get("/:id", asyncHandler(getWorkOrderController));

// Etapa 2 — Triagem e Planejamento.
workOrdersRoutes.post(
  "/:id/triagem",
  authorize(Role.TECNICO, Role.SUPERVISOR),
  asyncHandler(triagemController)
);
workOrdersRoutes.post(
  "/:id/planejamento",
  authorize(Role.TECNICO, Role.SUPERVISOR),
  asyncHandler(planejamentoController)
);

// Etapa 3 — Programação.
workOrdersRoutes.post(
  "/:id/programacao",
  authorize(Role.TECNICO, Role.SUPERVISOR),
  asyncHandler(programacaoController)
);

// Etapa 4 — Execução (o service confere que o TECNICO é o assignedTo).
workOrdersRoutes.post("/:id/iniciar", authorize(Role.TECNICO), asyncHandler(iniciarController));
workOrdersRoutes.post("/:id/registrar", authorize(Role.TECNICO), asyncHandler(registrarController));

// Etapa 5 — Encerramento técnico e Validação.
workOrdersRoutes.post(
  "/:id/encerramento-tecnico",
  authorize(Role.TECNICO),
  asyncHandler(encerramentoTecnicoController)
);
workOrdersRoutes.post("/:id/validar", authorize(Role.SUPERVISOR), asyncHandler(validarController));
workOrdersRoutes.post("/:id/cancelar", authorize(Role.SUPERVISOR), asyncHandler(cancelarController));
