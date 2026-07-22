import { z } from "zod";
import { Priority, WorkOrderStatus, WorkOrderType } from "../../domain/enums";

export const createWorkOrderSchema = z.object({
  type: z.nativeEnum(WorkOrderType),
  priority: z.nativeEnum(Priority),
  title: z.string().min(1, "Título é obrigatório."),
  description: z.string().min(1, "Descrição é obrigatória."),
  assetId: z.string().min(1, "Ativo é obrigatório."),
  targetSectorId: z.string().min(1).optional(),
});

export const listWorkOrdersQuerySchema = z.object({
  status: z.nativeEnum(WorkOrderStatus).optional(),
  type: z.nativeEnum(WorkOrderType).optional(),
  targetSectorId: z.string().optional(),
  assetId: z.string().optional(),
  assignedToId: z.string().optional(),
  requesterId: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const triagemSchema = z.object({
  priority: z.nativeEnum(Priority),
  targetSectorId: z.string().min(1, "Setor é obrigatório."),
});

export const planejamentoSchema = z.object({
  plan: z.string().min(1, "Plano é obrigatório."),
});

export const programacaoSchema = z.object({
  scheduledStart: z.coerce.date(),
  scheduledEnd: z.coerce.date(),
  assignedToId: z.string().min(1, "Técnico responsável é obrigatório."),
});

export const iniciarSchema = z.object({
  riskAnalysis: z.string().min(1, "Análise de risco é obrigatória."),
});

export const registrarSchema = z.object({
  rootCause: z.string().min(1, "Causa raiz é obrigatória."),
  repairDescription: z.string().min(1, "Descrição do reparo é obrigatória."),
  parts: z
    .array(
      z.object({
        partId: z.string().min(1),
        quantity: z.number().int().positive(),
      })
    )
    .optional(),
});

export const encerramentoTecnicoSchema = z.object({
  testNotes: z.string().min(1, "Notas de teste são obrigatórias."),
  cleanupDone: z.boolean(),
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

export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;
export type ListWorkOrdersQuery = z.infer<typeof listWorkOrdersQuerySchema>;
export type TriagemInput = z.infer<typeof triagemSchema>;
export type PlanejamentoInput = z.infer<typeof planejamentoSchema>;
export type ProgramacaoInput = z.infer<typeof programacaoSchema>;
export type IniciarInput = z.infer<typeof iniciarSchema>;
export type RegistrarInput = z.infer<typeof registrarSchema>;
export type EncerramentoTecnicoInput = z.infer<typeof encerramentoTecnicoSchema>;
export type ValidarInput = z.infer<typeof validarSchema>;
export type CancelarInput = z.infer<typeof cancelarSchema>;
