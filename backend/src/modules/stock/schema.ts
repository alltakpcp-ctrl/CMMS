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
