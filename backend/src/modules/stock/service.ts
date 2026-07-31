import { Prisma } from "@prisma/client";
import { AppError } from "../../lib/AppError";
import { INBOUND_TYPES, StockMovementType } from "./schema";

export interface RecordStockMovementInput {
  partId: string;
  type: StockMovementType;
  quantity: number;
  workOrderId?: string;
  partRequestId?: string;
  userId?: string;
  reason?: string;
  unitCost?: number;
}

export async function recordStockMovement(tx: Prisma.TransactionClient, input: RecordStockMovementInput) {
  const { partId, type, quantity, workOrderId, partRequestId, userId, reason, unitCost } = input;

  if (quantity <= 0) {
    throw new AppError(422, "INVALID_MOVEMENT_QTY", "Quantidade da movimentação deve ser maior que zero.");
  }

  const part = await tx.part.findUnique({ where: { id: partId } });
  if (!part) {
    throw new AppError(404, "PART_NOT_FOUND", "Peça não encontrada.");
  }

  const delta = INBOUND_TYPES.includes(type) ? quantity : -quantity;
  const balanceAfter = part.stockQty + delta;

  if (balanceAfter < 0) {
    throw new AppError(422, "INSUFFICIENT_STOCK", `Saldo insuficiente para a peça ${part.description}.`);
  }

  await tx.part.update({ where: { id: partId }, data: { stockQty: balanceAfter } });

  return tx.stockMovement.create({
    data: {
      partId,
      type,
      quantity,
      balanceAfter,
      workOrderId,
      partRequestId,
      userId,
      reason,
      unitCost: unitCost ?? part.unitCost ?? undefined,
    },
  });
}
