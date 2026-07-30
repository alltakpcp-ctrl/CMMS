import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import {
  calculateAdherence,
  calculateBacklog,
  calculateDistribution,
  calculateMtbf,
  calculateMttr,
  calculatePhaseDurations,
  calculateThroughput,
  calculateTrend,
  TrendResult,
  WorkOrderDistribution,
  WorkOrderForIndicators,
  WorkOrderLifecycle,
} from "../../lib/indicators";
import { WorkOrderStatus, WorkOrderType, Priority } from "../../domain/enums";
import { IndicatorsQuery } from "./schema";

async function fetchWorkOrdersForIndicators(filters: IndicatorsQuery): Promise<WorkOrderForIndicators[]> {
  const where: Prisma.WorkOrderWhereInput = {
    ...(filters.targetSectorId && { targetSectorId: filters.targetSectorId }),
    ...((filters.from || filters.to) && {
      createdAt: {
        ...(filters.from && { gte: filters.from }),
        ...(filters.to && { lte: filters.to }),
      },
    }),
  };

  const workOrders = await prisma.workOrder.findMany({
    where,
    select: {
      id: true,
      assetId: true,
      type: true,
      status: true,
      targetSectorId: true,
      priority: true,
      scheduledStart: true,
      executions: { select: { startedAt: true, finishedAt: true } },
    },
  });

  return workOrders.map((wo) => ({
    id: wo.id,
    assetId: wo.assetId,
    type: wo.type as WorkOrderType,
    status: wo.status as WorkOrderStatus,
    targetSectorId: wo.targetSectorId,
    priority: wo.priority as Priority | null,
    scheduledStart: wo.scheduledStart,
    executions: wo.executions,
  }));
}

export async function getOverview(filters: IndicatorsQuery) {
  const workOrders = await fetchWorkOrdersForIndicators(filters);

  const mttr = calculateMttr(workOrders);
  const mtbf = calculateMtbf(workOrders);
  const adherence = calculateAdherence(workOrders);
  const backlog = calculateBacklog(workOrders);

  return {
    mttrHours: mttr.overall.hours,
    mtbfHours: mtbf.overall.hours,
    adherencePercentage: adherence.percentage,
    backlogTotal: backlog.total,
  };
}

export async function getByAsset(filters: IndicatorsQuery) {
  const [workOrders, assets] = await Promise.all([
    fetchWorkOrdersForIndicators(filters),
    prisma.asset.findMany({ orderBy: { code: "asc" } }),
  ]);

  const mttr = calculateMttr(workOrders);
  const mtbf = calculateMtbf(workOrders);

  return assets.map((asset) => {
    const mttrEntry = mttr.byAsset.find((a) => a.assetId === asset.id);
    const mtbfEntry = mtbf.byAsset.find((a) => a.assetId === asset.id);
    return {
      assetId: asset.id,
      code: asset.code,
      name: asset.name,
      criticality: asset.criticality,
      mttrHours: mttrEntry?.hours ?? null,
      mtbfHours: mtbfEntry?.hours ?? null,
    };
  });
}

export async function getBacklog(filters: IndicatorsQuery) {
  const workOrders = await fetchWorkOrdersForIndicators(filters);
  return calculateBacklog(workOrders);
}

export async function getLifecycle(filters: IndicatorsQuery) {
  const where: Prisma.WorkOrderWhereInput = {
    ...(filters.targetSectorId && { targetSectorId: filters.targetSectorId }),
    ...((filters.from || filters.to) && {
      createdAt: {
        ...(filters.from && { gte: filters.from }),
        ...(filters.to && { lte: filters.to }),
      },
    }),
  };

  const workOrders = await prisma.workOrder.findMany({
    where,
    select: {
      id: true,
      status: true,
      statusHistory: {
        select: { toStatus: true, changedAt: true },
        orderBy: { changedAt: "asc" },
      },
    },
  });

  const mapped: WorkOrderLifecycle[] = workOrders.map((wo) => ({
    id: wo.id,
    status: wo.status as WorkOrderStatus,
    statusHistory: wo.statusHistory,
  }));

  return {
    phaseDurations: calculatePhaseDurations(mapped, new Date()),
    throughput: calculateThroughput(mapped, filters.from ?? null, filters.to ?? null),
  };
}

export async function getDistribution(filters: IndicatorsQuery) {
  const where: Prisma.WorkOrderWhereInput = {
    ...(filters.targetSectorId && { targetSectorId: filters.targetSectorId }),
    ...((filters.from || filters.to) && {
      createdAt: {
        ...(filters.from && { gte: filters.from }),
        ...(filters.to && { lte: filters.to }),
      },
    }),
  };

  const workOrders = await prisma.workOrder.findMany({
    where,
    select: {
      id: true,
      status: true,
      type: true,
      assignedToId: true,
      createdAt: true,
      assignedTo: { select: { name: true } },
    },
  });

  const mapped: WorkOrderDistribution[] = workOrders.map((wo) => ({
    id: wo.id,
    status: wo.status as WorkOrderStatus,
    type: wo.type as WorkOrderType,
    assignedToId: wo.assignedToId,
    assignedToName: wo.assignedTo?.name ?? null,
    createdAt: wo.createdAt,
  }));

  const distribution = calculateDistribution(mapped);

  let trend: TrendResult | null = null;
  if (filters.from && filters.to) {
    // Janela anterior de mesma largura, imediatamente antes de `from`. Topo
    // exclusivo (lt prevTo) para não contar duas vezes uma OS criada
    // exatamente em `from` — que já é contada na janela atual (gte from).
    const span = filters.to.getTime() - filters.from.getTime();
    const prevFrom = new Date(filters.from.getTime() - span);
    const prevTo = filters.from;

    const previousCount = await prisma.workOrder.count({
      where: {
        ...(filters.targetSectorId && { targetSectorId: filters.targetSectorId }),
        createdAt: { gte: prevFrom, lt: prevTo },
      },
    });

    trend = calculateTrend(mapped.length, previousCount);
  }

  return { distribution, trend };
}
