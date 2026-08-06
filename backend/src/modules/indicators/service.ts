import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import {
  calculateAdherence,
  calculateBacklog,
  calculateDistribution,
  calculateMtbf,
  calculateMttr,
  calculatePhaseDurations,
  calculateTechnicianEfficiency,
  calculateTechnicianParticipation,
  calculateThroughput,
  calculateTrend,
  TechnicianEfficiency,
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
      assignedToId: true,
      assignedTo: { select: { name: true } },
      executions: { select: { startedAt: true, finishedAt: true } },
      assignees: { select: { userId: true, user: { select: { name: true } } } },
      subtasks: {
        select: {
          assignedToId: true,
          assignedTo: { select: { name: true } },
          status: true,
          createdAt: true,
          finishedAt: true,
        },
      },
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
    assignedToId: wo.assignedToId,
    assignedToName: wo.assignedTo?.name ?? null,
    executions: wo.executions,
    assignees: wo.assignees.map((a) => ({ userId: a.userId, userName: a.user?.name ?? null })),
    subtasks: wo.subtasks.map((s) => ({
      assignedToId: s.assignedToId,
      assignedToName: s.assignedTo?.name ?? null,
      status: s.status,
      createdAt: s.createdAt,
      finishedAt: s.finishedAt,
    })),
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

export async function getTechnicianEfficiency(filters: IndicatorsQuery) {
  const periodWorkOrders = await fetchWorkOrdersForIndicators(filters);
  const periodEfficiency = calculateTechnicianEfficiency(periodWorkOrders);

  // inProgressCount deve refletir carga ATUAL, ignorando from/to (só respeita
  // targetSectorId) — query separada, sem filtro de data, só com status
  // não-terminal. Mescla por technicianId sobre o resultado do período:
  // sobrescreve inProgressCount onde o técnico já aparece e adiciona quem só
  // tem OS em aberto fora do período filtrado (com métricas de período
  // zeradas/null).
  const currentLoad = await prisma.workOrder.findMany({
    where: {
      status: { notIn: [WorkOrderStatus.ENCERRADA, WorkOrderStatus.CANCELADA] },
      ...(filters.targetSectorId && { targetSectorId: filters.targetSectorId }),
    },
    select: {
      assignedToId: true,
      assignedTo: { select: { name: true } },
    },
  });

  const inProgressByTechnician = new Map<string, { name: string; count: number }>();
  for (const wo of currentLoad) {
    if (!wo.assignedToId) continue;
    const existing = inProgressByTechnician.get(wo.assignedToId);
    inProgressByTechnician.set(wo.assignedToId, {
      name: wo.assignedTo?.name ?? existing?.name ?? "",
      count: (existing?.count ?? 0) + 1,
    });
  }

  const byId = new Map(periodEfficiency.map((t) => [t.technicianId, { ...t }]));
  for (const [technicianId, { name, count }] of inProgressByTechnician) {
    const existing = byId.get(technicianId);
    if (existing) {
      existing.inProgressCount = count;
    } else {
      byId.set(technicianId, {
        technicianId,
        technicianName: name,
        closedCount: 0,
        inProgressCount: count,
        mttrHours: null,
        adherencePercentage: null,
        typeMix: [],
        mttrAsPrincipalHours: null,
        mttrAsApoioHours: null,
        asPrincipalCount: 0,
        asApoioCount: 0,
      });
    }
  }

  // Participação (principal vs apoio) — calculada sobre o MESMO
  // periodWorkOrders (respeita from/to/targetSectorId), diferente do
  // inProgressCount acima (que ignora data de propósito). Técnicos que só
  // aparecem como apoio (nunca assignedToId) não existem em byId ainda —
  // entram aqui com closedCount/inProgressCount zerados.
  const participation = calculateTechnicianParticipation(periodWorkOrders);
  for (const p of participation) {
    const existing = byId.get(p.technicianId);
    if (existing) {
      existing.mttrAsPrincipalHours = p.mttrAsPrincipalHours;
      existing.mttrAsApoioHours = p.mttrAsApoioHours;
      existing.asPrincipalCount = p.asPrincipalCount;
      existing.asApoioCount = p.asApoioCount;
    } else {
      byId.set(p.technicianId, {
        technicianId: p.technicianId,
        technicianName: p.technicianName,
        closedCount: 0,
        inProgressCount: 0,
        mttrHours: null,
        adherencePercentage: null,
        typeMix: [],
        mttrAsPrincipalHours: p.mttrAsPrincipalHours,
        mttrAsApoioHours: p.mttrAsApoioHours,
        asPrincipalCount: p.asPrincipalCount,
        asApoioCount: p.asApoioCount,
      });
    }
  }

  const technicians: TechnicianEfficiency[] = Array.from(byId.values()).sort(
    (a, b) => b.closedCount - a.closedCount || a.technicianName.localeCompare(b.technicianName)
  );

  return { technicians };
}
