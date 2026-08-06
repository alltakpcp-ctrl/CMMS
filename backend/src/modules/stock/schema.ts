import { z } from "zod";

// String-based, conforme CLAUDE.md §2 (sem enum Prisma).
export const stockMovementTypeSchema = z.enum([
  "ENTRADA",
  "SAIDA",
  "AJUSTE",
  "DEVOLUCAO",
]);

export type StockMovementType = z.infer<typeof stockMovementTypeSchema>;

export const stockStatusSchema = z.enum(["URGENTE", "ALERTA", "BOM", "EXCESSO"]);
export type StockStatus = z.infer<typeof stockStatusSchema>;

/**
 * Deriva o status a partir de saldo/mínimo/máximo.
 * Urgente: stockQty <= minStock (inclui zero)
 * Alerta:  minStock < stockQty <= minStock * 1.2
 * Excesso: maxStock != null && stockQty > maxStock
 * Bom:     demais casos
 * Sem minStock definido, não há como classificar por baixo -> BOM (ou Excesso se acima do máx).
 */
export function deriveStockStatus(
  stockQty: number,
  minStock: number | null,
  maxStock: number | null
): StockStatus {
  if (maxStock != null && stockQty > maxStock) return "EXCESSO";
  if (minStock != null) {
    if (stockQty <= minStock) return "URGENTE";
    if (stockQty <= minStock * 1.2) return "ALERTA";
  }
  return "BOM";
}

/** Status efetivo: override manual vence a derivação. */
export function effectiveStockStatus(
  stockQty: number,
  minStock: number | null,
  maxStock: number | null,
  override: string | null
): StockStatus {
  if (override && stockStatusSchema.safeParse(override).success) {
    return override as StockStatus;
  }
  return deriveStockStatus(stockQty, minStock, maxStock);
}

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
  stockStatusOverride: stockStatusSchema.nullable().optional(),
  orderRef: z.string().trim().min(1).optional(),
});

export type StockEntryInput = z.infer<typeof stockEntrySchema>;
export type StockReturnInput = z.infer<typeof stockReturnSchema>;
export type StockAdjustInput = z.infer<typeof stockAdjustSchema>;
