import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../lib/AppError";
import {
  effectiveStockStatus,
  INBOUND_TYPES,
  StockAdjustInput,
  StockEntryInput,
  StockMovementType,
  StockReturnInput,
} from "./schema";

export interface RecordStockMovementInput {
  partId: string;
  type: StockMovementType;
  quantity: number;
  workOrderId?: string;
  partRequestId?: string;
  userId?: string;
  reason?: string;
  unitCost?: number;
  statusSnapshot?: string;
  orderRef?: string;
}

export async function recordStockMovement(tx: Prisma.TransactionClient, input: RecordStockMovementInput) {
  const { partId, type, quantity, workOrderId, partRequestId, userId, reason, unitCost, statusSnapshot, orderRef } = input;

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
      statusSnapshot,
      orderRef,
    },
  });
}

export function stockEntry(input: StockEntryInput, userId: string) {
  return prisma.$transaction((tx) =>
    recordStockMovement(tx, {
      partId: input.partId,
      type: "ENTRADA",
      quantity: input.quantity,
      reason: input.reason,
      unitCost: input.unitCost,
      userId,
    })
  );
}

export function stockReturn(input: StockReturnInput, userId: string) {
  return prisma.$transaction((tx) =>
    recordStockMovement(tx, {
      partId: input.partId,
      type: "DEVOLUCAO",
      quantity: input.quantity,
      reason: input.reason,
      workOrderId: input.workOrderId,
      userId,
    })
  );
}

export async function stockAdjust(input: StockAdjustInput, userId: string) {
  const type: StockMovementType = input.direction === "increase" ? "ENTRADA" : "AJUSTE";

  return prisma.$transaction(async (tx) => {
    // Persistir override manual na Part, se enviado (null limpa; undefined mantém).
    if (input.stockStatusOverride !== undefined) {
      await tx.part.update({
        where: { id: input.partId },
        data: { stockStatusOverride: input.stockStatusOverride },
      });
    }

    const movement = await recordStockMovement(tx, {
      partId: input.partId,
      type,
      quantity: input.quantity,
      reason: input.reason,
      userId,
      orderRef: input.orderRef,
    });

    // Snapshot do status EFETIVO após o movimento (usa saldo já atualizado).
    const part = await tx.part.findUnique({ where: { id: input.partId } });
    if (part) {
      const status = effectiveStockStatus(
        part.stockQty,
        part.minStock,
        part.maxStock,
        part.stockStatusOverride
      );
      await tx.stockMovement.update({
        where: { id: movement.id },
        data: { statusSnapshot: status },
      });
      return { ...movement, statusSnapshot: status };
    }
    return movement;
  });
}

export function listLowStockParts() {
  return prisma.part
    .findMany({
      where: {
        active: true,
        minStock: { not: null },
      },
      orderBy: { code: "asc" },
    })
    .then((parts) =>
      parts
        .filter((p) => p.minStock !== null && p.stockQty <= p.minStock)
        .map((p) => ({
          ...p,
          stockStatus: effectiveStockStatus(p.stockQty, p.minStock, p.maxStock, p.stockStatusOverride),
        }))
    );
}

export async function getPartLedger(partId: string) {
  const part = await prisma.part.findUnique({ where: { id: partId } });
  if (!part) {
    throw new AppError(404, "PART_NOT_FOUND", "Peça não encontrada.");
  }

  return prisma.stockMovement.findMany({
    where: { partId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      type: true,
      quantity: true,
      balanceAfter: true,
      unitCost: true,
      reason: true,
      workOrderId: true,
      userId: true,
      createdAt: true,
    },
  });
}
