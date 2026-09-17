import { z } from "zod";
import { MaintenanceDiscipline, MaintenancePeriodicity, Priority } from "../../domain/enums";

const maintenancePlanFieldsSchema = z.object({
  assetId: z.string().min(1, "Ativo é obrigatório."),
  discipline: z.nativeEnum(MaintenanceDiscipline),
  title: z.string().min(1, "Título é obrigatório."),
  description: z.string().min(1).optional(),
  priority: z.nativeEnum(Priority),
  periodicity: z.nativeEnum(MaintenancePeriodicity),
  // Toda MaintenancePlan é implicitamente PREVENTIVA — a mesma regra de
  // "estimativa obrigatória para PREVENTIVA" já existente em
  // workOrderStateMachine.ts é aplicada aqui, um passo mais cedo.
  estimatedHours: z.number().positive("Tempo estimado é obrigatório."),
  responsible: z.string().min(1).optional(),
  action01: z.string().min(1).optional(),
  action02: z.string().min(1).optional(),
  action03: z.string().min(1).optional(),
  action04: z.string().min(1).optional(),
  action05: z.string().min(1).optional(),
  action06: z.string().min(1).optional(),
});

// Campos usados só para gerar a OS (não persistidos na MaintenancePlan em
// si) — compartilhados entre "criar plano" (1º ciclo) e "gerar OS" (ciclos
// seguintes, plano já existente).
const generateWorkOrderFieldsSchema = z.object({
  scheduledStart: z.coerce.date(),
  scheduledEnd: z.coerce.date(),
  assigneeIds: z.array(z.string().min(1)).min(1, "Selecione ao menos um técnico."),
});

function withScheduleRefine<T extends z.ZodTypeAny>(schema: T) {
  return schema.refine(
    (data: { scheduledStart: Date; scheduledEnd: Date }) => data.scheduledEnd > data.scheduledStart,
    { message: "Fim estimado deve ser depois do início.", path: ["scheduledEnd"] }
  );
}

// Criar um plano de preventiva gera a 1ª OS na hora (já PROGRAMADA) — por
// isso o schema de criação também exige os campos de agendamento.
export const createMaintenancePlanSchema = withScheduleRefine(
  maintenancePlanFieldsSchema.extend(generateWorkOrderFieldsSchema.shape)
);

// Editar um plano existente (checklist, periodicidade, desativar) NÃO gera
// nova OS — só os campos do plano em si, sem agendamento.
export const updateMaintenancePlanSchema = maintenancePlanFieldsSchema.partial().extend({
  active: z.boolean().optional(),
});

// POST /maintenance-plans/:id/gerar-os — novo ciclo a partir de um plano já
// existente (ex.: plano venceu de novo após a OS anterior ser ENCERRADA).
export const generateWorkOrderFromPlanSchema = withScheduleRefine(generateWorkOrderFieldsSchema);

export const listMaintenancePlansQuerySchema = z.object({
  assetId: z.string().optional(),
  discipline: z.nativeEnum(MaintenanceDiscipline).optional(),
  priority: z.nativeEnum(Priority).optional(),
  active: z.coerce.boolean().optional(),
  // Fase 4 do "baú" (CLAUDE.md §5.2): por padrão, a Agenda não vê plano
  // excluído em cascata. Só o Baú (Fase 5) passa true pra enxergá-lo.
  incluirExcluidos: z.coerce.boolean().optional().default(false),
});

// Exclusão lógica do plano (§5.2 do CLAUDE.md, extensão pro plano em si, não
// só cascata a partir da OS) — mesmo padrão de excluirSchema em
// workorders/schema.ts: nunca apaga a linha, motivo obrigatório.
export const excluirMaintenancePlanSchema = z.object({
  reason: z.string().min(1, "Motivo é obrigatório para excluir o plano."),
});

export type CreateMaintenancePlanInput = z.infer<typeof createMaintenancePlanSchema>;
export type UpdateMaintenancePlanInput = z.infer<typeof updateMaintenancePlanSchema>;
export type GenerateWorkOrderFromPlanInput = z.infer<typeof generateWorkOrderFromPlanSchema>;
export type ListMaintenancePlansQuery = z.infer<typeof listMaintenancePlansQuerySchema>;
export type ExcluirMaintenancePlanInput = z.infer<typeof excluirMaintenancePlanSchema>;
