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
  reprogramacaoController,
  timelineOverrideController,
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
// Reprogramação: troca de técnico e/ou reagendamento de datas a qualquer
// momento (exceto ENCERRADA/CANCELADA), sem alterar o status da OS.
workOrdersRoutes.patch(
  "/:id/programacao",
  authorize(Role.SUPERVISOR),
  asyncHandler(reprogramacaoController)
);

// Etapa 4 — Execução (o service confere que o TECNICO é o assignedTo; SUPERVISOR é isento).
workOrdersRoutes.post(
  "/:id/iniciar",
  authorize(Role.TECNICO, Role.SUPERVISOR),
  asyncHandler(iniciarController)
);
workOrdersRoutes.post(
  "/:id/registrar",
  authorize(Role.TECNICO, Role.SUPERVISOR),
  asyncHandler(registrarController)
);

// Etapa 5 — Encerramento técnico e Validação.
workOrdersRoutes.post(
  "/:id/encerramento-tecnico",
  authorize(Role.TECNICO, Role.SUPERVISOR),
  asyncHandler(encerramentoTecnicoController)
);
workOrdersRoutes.post("/:id/validar", authorize(Role.SUPERVISOR), asyncHandler(validarController));
workOrdersRoutes.post("/:id/cancelar", authorize(Role.SUPERVISOR), asyncHandler(cancelarController));

// Override manual da linha do tempo — SUPERVISOR pode mover a OS para
// qualquer status, fora da máquina de estados normal (canTransition).
workOrdersRoutes.patch(
  "/:id/timeline",
  authorize(Role.SUPERVISOR),
  asyncHandler(timelineOverrideController)
);
