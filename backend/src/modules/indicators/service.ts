import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import {
  calculateAdherence,
  calculateBacklog,
  calculateMtbf,
  calculateMttr,
  WorkOrderForIndicators,
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
