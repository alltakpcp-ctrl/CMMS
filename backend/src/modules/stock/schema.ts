import { z } from "zod";

// String-based, conforme CLAUDE.md §2 (sem enum Prisma).
export const stockMovementTypeSchema = z.enum([
  "ENTRADA",
  "SAIDA",
  "AJUSTE",
  "DEVOLUCAO",
]);

export type StockMovementType = z.infer<typeof stockMovementTypeSchema>;

// Tipos que ADICIONAM saldo vs. que SUBTRAEM.
export const INBOUND_TYPES: StockMovementType[] = ["ENTRADA", "DEVOLUCAO"];
export const OUTBOUND_TYPES: StockMovementType[] = ["SAIDA", "AJUSTE"];

export const stockEntrySchema = z.object({
  partId: z.string().min(1),
  quantity: z.number().int().positive(),
  reason: z.string().min(1, "Observação é obrigatória."),
  unitCost: z.number().nonnegative().optional(),
});

export const stockReturnSchema = z.object({
  partId: z.string().min(1),
  quantity: z.number().int().positive(),
  reason: z.string().min(1, "Observação é obrigatória."),
  workOrderId: z.string().optional(),
});

export const stockAdjustSchema = z.object({
  partId: z.string().min(1),
  quantity: z.number().int().positive(),
  direction: z.enum(["increase", "decrease"]),
  reason: z.string().min(1, "Observação é obrigatória."),
});

export type StockEntryInput = z.infer<typeof stockEntrySchema>;
export type StockReturnInput = z.infer<typeof stockReturnSchema>;
export type StockAdjustInput = z.infer<typeof stockAdjustSchema>;
