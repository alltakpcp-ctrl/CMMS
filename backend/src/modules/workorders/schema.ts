import { z } from "zod";
import { Disciplina, ExecutionOutcome, MaintenancePeriodicity, Priority, WorkOrderStatus, WorkOrderType } from "../../domain/enums";

export const createWorkOrderSchema = z.object({
  type: z.nativeEnum(WorkOrderType),
  disciplina: z.nativeEnum(Disciplina),
  priority: z.nativeEnum(Priority),
  title: z.string().min(1, "Título é obrigatório."),
  description: z.string().min(1, "Descrição é obrigatória."),
  assetId: z.string().min(1, "Ativo é obrigatório."),
});

export const listWorkOrdersQuerySchema = z.object({
  status: z.nativeEnum(WorkOrderStatus).optional(),
  type: z.nativeEnum(WorkOrderType).optional(),
  targetSectorId: z.string().optional(),
  assetId: z.string().optional(),
  assignedToId: z.string().optional(),
  requesterId: z.string().optional(),
  asSupport: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  // Fase 4 do "baú" (CLAUDE.md §5.2): por padrão, toda listagem esconde OS
  // excluída. Só o Baú (Fase 5) passa true pra enxergá-las.
  incluirExcluidas: z.coerce.boolean().optional().default(false),
});

export const triagemSchema = z.object({
  priority: z.nativeEnum(Priority),
  targetSectorId: z.string().min(1, "Setor é obrigatório."),
  trabalhoEmAltura: z.boolean().optional().default(false),
  // Só se aplica a OS PREVENTIVA — validado em workorders/service.ts#triagem
  // (o schema não conhece o type da OS em si). Preenchida, grava/atualiza a
  // periodicidade do MaintenancePlan vinculado.
  periodicity: z.nativeEnum(MaintenancePeriodicity).optional(),
});

export const plannedPartSchema = z.object({
  partId: z.string().min(1, "Peça é obrigatória."),
  quantity: z.number().int().positive("Quantidade deve ser maior que zero."),
});

export const planejamentoSchema = z.object({
  plan: z.string().min(1, "Plano é obrigatório."),
  // numMaintainers não é mais aceito como input — é derivado de
  // assigneeIds.length + 1 (responsável principal) em workorders/service.ts.
  estimatedHours: z.number().positive().optional(),
  plannedParts: z.array(plannedPartSchema).optional(),
  tools: z.array(z.string().min(1)).optional(),
  ppe: z.array(z.string().min(1)).optional(),
  assigneeIds: z.array(z.string().min(1)).optional().default([]),
});

export const programacaoSchema = z.object({
  scheduledStart: z.coerce.date(),
  scheduledEnd: z.coerce.date(),
  assigneeIds: z.array(z.string().min(1)).min(1, "Selecione ao menos um técnico."),
  // Obrigatório apenas para PREVENTIVA — reforçado em canTransition
  // (workOrderStateMachine.ts), que conhece o type da OS.
  estimatedHours: z.number().positive().optional(),
});

export const reprogramacaoSchema = z
  .object({
    scheduledStart: z.coerce.date().optional(),
    scheduledEnd: z.coerce.date().optional(),
    assignedToId: z.string().min(1, "Técnico responsável é obrigatório.").optional(),
  })
  .refine(
    (data) =>
      data.scheduledStart !== undefined ||
      data.scheduledEnd !== undefined ||
      data.assignedToId !== undefined,
    { message: "Informe ao menos um campo para reprogramar (técnico e/ou datas)." }
  );

export const iniciarSchema = z.object({
  riskAnalysis: z.string().min(1, "Análise de risco é obrigatória."),
  assigneeIds: z.array(z.string().min(1)).optional().default([]),
  startNote: z.string().trim().min(1).optional(),
});

export const registrarSchema = z
  .object({
    rootCause: z.string().min(1).optional(),
    repairDescription: z.string().min(1).optional(),
  })
  .refine((data) => Boolean(data.rootCause?.trim()) || Boolean(data.repairDescription?.trim()), {
    message: "Informe a causa raiz e/ou a descrição do reparo.",
  });

// Peças usadas passam a ser declaradas só aqui (não mais em registrar()):
// o consumo de peças virou obrigatório no encerramento técnico — ou informa
// ao menos 1 peça, ou marca partsNotApplicable. A declaração gera uma
// StockWithdrawalRequest (ver stock-withdrawals/service.ts#createWithdrawalRequest);
// o débito de estoque em si só acontece quando o almoxarife aprovar.
export const encerramentoTecnicoSchema = z
  .object({
    testNotes: z.string().min(1, "Notas de teste são obrigatórias."),
    cleanupDone: z.boolean(),
    endNote: z.string().trim().min(1).optional(),
    outcome: z.nativeEnum(ExecutionOutcome).optional(),
    parts: z
      .array(
        z.object({
          partId: z.string().min(1),
          quantity: z.number().int().positive(),
        })
      )
      .optional(),
    partsNotApplicable: z.boolean().optional(),
  })
  .refine((data) => data.partsNotApplicable === true || (data.parts?.length ?? 0) > 0, {
    message: "Informe as peças utilizadas ou marque que não houve consumo.",
    path: ["parts"],
  });

export const validarSchema = z
  .object({
    approve: z.boolean(),
    note: z.string().optional(),
  })
  .refine((data) => data.approve || Boolean(data.note), {
    message: "Nota é obrigatória ao reprovar a validação.",
    path: ["note"],
  });

export const cancelarSchema = z.object({
  note: z.string().min(1, "Nota é obrigatória para cancelar a OS."),
});

// Exclusão lógica (§5.2 do CLAUDE.md) — só aplicável a OS em ABERTA, checado
// em workorders/service.ts#excluir (o schema não conhece o status da OS).
// Nunca apaga a linha; motivo obrigatório, mesmo padrão de cancelarSchema.
export const excluirSchema = z.object({
  reason: z.string().min(1, "Motivo é obrigatório para excluir a OS."),
});

// Baú (Fase 5, §5.2 do CLAUDE.md) — só paginação, sem filtro de status (o
// próprio endpoint já restringe a CANCELADA/excluída).
export const listBauQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

// Override manual da timeline pelo SUPERVISOR — não passa pela máquina de
// estados (canTransition). Nota é obrigatória por ser uma ação excepcional.
export const timelineOverrideSchema = z.object({
  toStatus: z.nativeEnum(WorkOrderStatus, {
    errorMap: () => ({ message: "Status de destino inválido." }),
  }),
  note: z.string().min(5, "Motivo do override é obrigatório (mín. 5 caracteres)."),
});

export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;
export type ListWorkOrdersQuery = z.infer<typeof listWorkOrdersQuerySchema>;
export type TriagemInput = z.infer<typeof triagemSchema>;
export type PlanejamentoInput = z.infer<typeof planejamentoSchema>;
export type ProgramacaoInput = z.infer<typeof programacaoSchema>;
export type ReprogramacaoInput = z.infer<typeof reprogramacaoSchema>;
export type IniciarInput = z.infer<typeof iniciarSchema>;
export type RegistrarInput = z.infer<typeof registrarSchema>;
export type EncerramentoTecnicoInput = z.infer<typeof encerramentoTecnicoSchema>;
export type ValidarInput = z.infer<typeof validarSchema>;
export type CancelarInput = z.infer<typeof cancelarSchema>;
export type ExcluirInput = z.infer<typeof excluirSchema>;
export type ListBauQuery = z.infer<typeof listBauQuerySchema>;
export type TimelineOverrideInput = z.infer<typeof timelineOverrideSchema>;
