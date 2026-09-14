import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../lib/AppError";
import {
  effectiveStockStatus,
  INBOUND_TYPES,
  stockStatusSchema,
  StockAdjustInput,
  StockEntryInput,
  StockMovementType,
  StockReturnInput,
} from "./schema";

// Peça sem SAIDA registrada há mais desse número de dias entra na lista de
// "sem giro" do dashboard (ver getStockDashboard) — limiar arbitrário de
// negócio, não derivado de nenhuma constante existente.
const DEAD_STOCK_DAYS = 90;

/** Extrai o rótulo de armário a partir do texto livre de `Part.location`
 * (gerado por `parseLocation` em `scripts/import-parts-controle.ts`, formato
 * "Armário X" ou "Armário X, Prateleira Y"). Peças com `location` em outro
 * formato (ex.: só "Prateleira Y") ou sem `location` caem em "Sem armário". */
function extractArmario(location: string | null): string {
  if (!location) return "Sem armário";
  const match = location.match(/^Armário\s+([^,]+)/i);
  return match ? `Armário ${match[1].trim()}` : "Sem armário";
}

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

export async function getStockDashboard() {
  const [parts, topUsedGroups, lastOutboundByPart, recentMovements] = await Promise.all([
    prisma.part.findMany({
      where: { active: true },
      include: { sector: { select: { id: true, name: true } } },
      orderBy: { code: "asc" },
    }),
    prisma.stockMovement.groupBy({
      by: ["partId"],
      where: { type: "SAIDA" },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 20,
    }),
    prisma.stockMovement.groupBy({
      by: ["partId"],
      where: { type: "SAIDA" },
      _max: { createdAt: true },
    }),
    prisma.stockMovement.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      include: {
        part: { select: { code: true, description: true } },
        user: { select: { name: true } },
      },
    }),
  ]);

  const partsWithStatus = parts.map((p) => ({
    ...p,
    stockStatus: effectiveStockStatus(p.stockQty, p.minStock, p.maxStock, p.stockStatusOverride),
  }));

  const totalStockQty = partsWithStatus.reduce((sum, p) => sum + p.stockQty, 0);
  const totalValue = partsWithStatus.reduce(
    (sum, p) => sum + p.stockQty * (p.unitCost ? Number(p.unitCost) : 0),
    0
  );
  const partsWithoutCost = partsWithStatus.filter((p) => p.stockQty > 0 && p.unitCost === null).length;

  const byStatus = stockStatusSchema.options.map((status) => {
    const inStatus = partsWithStatus.filter((p) => p.stockStatus === status);
    return {
      status,
      count: inStatus.length,
      stockQty: inStatus.reduce((sum, p) => sum + p.stockQty, 0),
    };
  });

  const armarioMap = new Map<string, { count: number; stockQty: number }>();
  for (const p of partsWithStatus) {
    const label = extractArmario(p.location);
    const entry = armarioMap.get(label) ?? { count: 0, stockQty: 0 };
    entry.count += 1;
    entry.stockQty += p.stockQty;
    armarioMap.set(label, entry);
  }
  const byArmario = [...armarioMap.entries()]
    .map(([armario, v]) => ({ armario, ...v }))
    .sort((a, b) => b.stockQty - a.stockQty);

  const sectorMap = new Map<string, { sectorId: string | null; count: number; stockQty: number }>();
  for (const p of partsWithStatus) {
    const label = p.sector?.name ?? "Sem setor";
    const entry = sectorMap.get(label) ?? { sectorId: p.sector?.id ?? null, count: 0, stockQty: 0 };
    entry.count += 1;
    entry.stockQty += p.stockQty;
    sectorMap.set(label, entry);
  }
  const bySector = [...sectorMap.entries()]
    .map(([sectorName, v]) => ({ sectorName, ...v }))
    .sort((a, b) => b.stockQty - a.stockQty);

  const topUsedPartIds = topUsedGroups.map((g) => g.partId);
  const topUsedPartsById = new Map(
    (await prisma.part.findMany({ where: { id: { in: topUsedPartIds } } })).map((p) => [p.id, p])
  );
  const topUsedParts = topUsedGroups
    .map((g) => {
      const part = topUsedPartsById.get(g.partId);
      if (!part) return null;
      return {
        partId: part.id,
        code: part.code,
        description: part.description,
        unit: part.unit,
        totalQuantity: g._sum.quantity ?? 0,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const lastOutboundByPartId = new Map(
    lastOutboundByPart.map((g) => [g.partId, g._max.createdAt as Date | null])
  );
  const now = Date.now();
  const deadStock = partsWithStatus
    .filter((p) => p.stockQty > 0)
    .map((p) => {
      const lastOut = lastOutboundByPartId.get(p.id) ?? null;
      const daysSinceLastOutbound = lastOut ? Math.floor((now - lastOut.getTime()) / 86_400_000) : null;
      return { ...p, daysSinceLastOutbound };
    })
    .filter((p) => p.daysSinceLastOutbound === null || p.daysSinceLastOutbound >= DEAD_STOCK_DAYS)
    .sort((a, b) => {
      if (a.daysSinceLastOutbound === null && b.daysSinceLastOutbound === null) return 0;
      if (a.daysSinceLastOutbound === null) return -1;
      if (b.daysSinceLastOutbound === null) return 1;
      return b.daysSinceLastOutbound - a.daysSinceLastOutbound;
    })
    .slice(0, 20)
    .map((p) => ({
      id: p.id,
      code: p.code,
      description: p.description,
      stockQty: p.stockQty,
      daysSinceLastOutbound: p.daysSinceLastOutbound,
    }));

  return {
    summary: {
      totalParts: partsWithStatus.length,
      totalStockQty,
      totalValue,
      partsWithoutCost,
    },
    byStatus,
    byArmario,
    bySector,
    topUsedParts,
    deadStock,
    recentMovements: recentMovements.map((m) => ({
      id: m.id,
      type: m.type,
      quantity: m.quantity,
      balanceAfter: m.balanceAfter,
      reason: m.reason,
      createdAt: m.createdAt,
      partCode: m.part.code,
      partDescription: m.part.description,
      userName: m.user?.name ?? null,
    })),
  };
}
