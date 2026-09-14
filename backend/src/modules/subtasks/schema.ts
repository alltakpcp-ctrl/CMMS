import { z } from "zod";

// String-based, conforme CLAUDE.md §2 (sem enum Prisma).
export const subtaskStatusSchema = z.enum(["ABERTA", "CONCLUIDA", "CANCELADA"]);
export type SubtaskStatus = z.infer<typeof subtaskStatusSchema>;

export const createSubtaskSchema = z.object({
  title: z.string().min(1, "Título é obrigatório."),
  description: z.string().optional(),
  estimatedHours: z.number().positive("Estimativa deve ser de ao menos 0,25h (15 minutos)."),
  assignedToId: z.string().min(1).optional(),
});

export const updateSubtaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  estimatedHours: z.number().positive().optional(),
  assignedToId: z.string().min(1).optional(),
});

// Consumo de peças declarado obrigatoriamente ao concluir (não ao cancelar) —
// mesma regra do encerramento técnico da OS (workorders/schema.ts). Gera uma
// StockWithdrawalRequest (ver stock-withdrawals/service.ts#createWithdrawalRequest).
export const finishSubtaskSchema = z
  .object({
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

export type CreateSubtaskInput = z.infer<typeof createSubtaskSchema>;
export type UpdateSubtaskInput = z.infer<typeof updateSubtaskSchema>;
export type FinishSubtaskInput = z.infer<typeof finishSubtaskSchema>;
