import { Priority, WorkOrderStatus, WorkOrderType } from "../domain/enums";

// Formato mínimo de OS necessário para os cálculos — mantém as funções puras
// e testáveis sem depender do Prisma (§4.1 da spec 04).
export interface WorkOrderForIndicators {
  id: string;
  assetId: string;
  type: WorkOrderType;
  status: WorkOrderStatus;
  targetSectorId: string | null;
  priority: Priority | null;
  scheduledStart: Date | null;
  executions: { startedAt: Date | null; finishedAt: Date | null }[];
}

const MS_PER_HOUR = 1000 * 60 * 60;

function hoursBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / MS_PER_HOUR;
}

// Janela agregada da OS através de todos os ciclos de execução: primeiro
// startedAt registrado até o último finishedAt registrado. Execuções sem o
// respectivo campo preenchido (ciclo ainda em aberto, ou nunca iniciado) são
// ignoradas nesse cálculo — uma OS sem nenhum startedAt/finishedAt válido
// resulta em null (excluída dos indicadores, como antes da migração 1:N).
function aggregatedExecutionWindow(wo: WorkOrderForIndicators): {
  startedAt: Date | null;
  finishedAt: Date | null;
} {
  const starts = wo.executions.map((e) => e.startedAt).filter((d): d is Date => d !== null);
  const finishes = wo.executions.map((e) => e.finishedAt).filter((d): d is Date => d !== null);

  return {
    startedAt: starts.length > 0 ? new Date(Math.min(...starts.map((d) => d.getTime()))) : null,
    finishedAt: finishes.length > 0 ? new Date(Math.max(...finishes.map((d) => d.getTime()))) : null,
  };
}

// ---------------------------------------------------------------------------
// MTTR — Tempo Médio de Reparo (§8): média de (finishedAt − startedAt) das OS
// ENCERRADAS que têm execução completa, em horas. "Agregado" = pool de todas
// as execuções qualificadas (não a média das médias por ativo).
// ---------------------------------------------------------------------------
export interface MttrResult {
  hours: number | null;
  sampleSize: number;
}

export function calculateMttr(workOrders: WorkOrderForIndicators[]): {
  overall: MttrResult;
  byAsset: Array<{ assetId: string } & MttrResult>;
} {
  const qualifying = workOrders
    .map((wo) => ({ wo, window: aggregatedExecutionWindow(wo) }))
    .filter(
      ({ wo, window }) => wo.status === WorkOrderStatus.ENCERRADA && window.startedAt && window.finishedAt
    );

  const overall = summarizeHours(
    qualifying.map(({ window }) => hoursBetween(window.startedAt!, window.finishedAt!))
  );

  const byAssetMap = new Map<string, number[]>();
  for (const { wo, window } of qualifying) {
    const hours = hoursBetween(window.startedAt!, window.finishedAt!);
    const list = byAssetMap.get(wo.assetId) ?? [];
    list.push(hours);
    byAssetMap.set(wo.assetId, list);
  }

  const byAsset = Array.from(byAssetMap.entries()).map(([assetId, hoursList]) => ({
    assetId,
    ...summarizeHours(hoursList),
  }));

  return { overall, byAsset };
}

function summarizeHours(hoursList: number[]): MttrResult {
  if (hoursList.length === 0) return { hours: null, sampleSize: 0 };
  const total = hoursList.reduce((sum, h) => sum + h, 0);
  return { hours: total / hoursList.length, sampleSize: hoursList.length };
}

// ---------------------------------------------------------------------------
// MTBF — Tempo Médio Entre Falhas (§8), considerando OS CORRETIVAS encerradas.
// Fórmula adotada (aproximação MVP documentada no CLAUDE.md): para o conjunto
// de falhas (ordenadas por startedAt),
//   tempoTotalObservado = finishedAt da última falha − startedAt da primeira
//   tempoTotalEmReparo  = soma de (finishedAt − startedAt) de cada falha
//   MTBF = max(0, tempoTotalObservado − tempoTotalEmReparo) ÷ nº de falhas
// Com 0 falhas -> null (sem dados). Com 1 falha, a primeira e a última falha
// são a mesma OS, então tempoTotalObservado = tempoTotalEmReparo e MTBF = 0
// (ainda não há intervalo "entre" falhas observável).
// ---------------------------------------------------------------------------
export interface MtbfResult {
  hours: number | null;
  failureCount: number;
}

export function calculateMtbf(workOrders: WorkOrderForIndicators[]): {
  overall: MtbfResult;
  byAsset: Array<{ assetId: string } & MtbfResult>;
} {
  const failures = workOrders
    .map((wo) => ({ wo, window: aggregatedExecutionWindow(wo) }))
    .filter(
      ({ wo, window }) =>
        wo.status === WorkOrderStatus.ENCERRADA &&
        wo.type === WorkOrderType.CORRETIVA &&
        window.startedAt &&
        window.finishedAt
    );

  const overall = summarizeMtbf(failures);

  const byAssetMap = new Map<string, typeof failures>();
  for (const failure of failures) {
    const list = byAssetMap.get(failure.wo.assetId) ?? [];
    list.push(failure);
    byAssetMap.set(failure.wo.assetId, list);
  }

  const byAsset = Array.from(byAssetMap.entries()).map(([assetId, list]) => ({
    assetId,
    ...summarizeMtbf(list),
  }));

  return { overall, byAsset };
}

function summarizeMtbf(failures: Array<{ wo: WorkOrderForIndicators; window: { startedAt: Date | null; finishedAt: Date | null } }>): MtbfResult {
  if (failures.length === 0) return { hours: null, failureCount: 0 };

  const sorted = [...failures].sort(
    (a, b) => a.window.startedAt!.getTime() - b.window.startedAt!.getTime()
  );

  const totalRepairHours = sorted.reduce(
    (sum, { window }) => sum + hoursBetween(window.startedAt!, window.finishedAt!),
    0
  );
  const totalObservedHours = hoursBetween(
    sorted[0].window.startedAt!,
    sorted[sorted.length - 1].window.finishedAt!
  );

  const hours = Math.max(0, totalObservedHours - totalRepairHours) / sorted.length;
  return { hours, failureCount: sorted.length };
}

// ---------------------------------------------------------------------------
// Aderência à programação (§8):
//   (OS cuja execução iniciou dentro da janela) ÷ (OS que foram programadas) × 100
// "Programadas" = OS com scheduledStart preenchido (independente do status
// atual). Tolerância adotada: início no MESMO DIA CALENDÁRIO do scheduledStart
// (§8 sugere "iniciou no dia agendado"). OS programada que ainda não iniciou
// conta no denominador mas não no numerador (ainda não é aderente).
// ---------------------------------------------------------------------------
export interface AdherenceResult {
  percentage: number | null;
  onTime: number;
  totalScheduled: number;
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function calculateAdherence(workOrders: WorkOrderForIndicators[]): AdherenceResult {
  const scheduled = workOrders.filter((wo) => wo.scheduledStart);
  const onTime = scheduled.filter((wo) => {
    const startedAt = aggregatedExecutionWindow(wo).startedAt;
    return startedAt && isSameCalendarDay(startedAt, wo.scheduledStart!);
  });

  return {
    percentage: scheduled.length === 0 ? null : (onTime.length / scheduled.length) * 100,
    onTime: onTime.length,
    totalScheduled: scheduled.length,
  };
}

// ---------------------------------------------------------------------------
// Backlog (§8): OS em PROGRAMADA e status anteriores (ainda não iniciou a
// execução), agrupável por setor e prioridade.
// ---------------------------------------------------------------------------
const BACKLOG_STATUSES: WorkOrderStatus[] = [
  WorkOrderStatus.ABERTA,
  WorkOrderStatus.TRIAGEM,
  WorkOrderStatus.PLANEJADA,
  WorkOrderStatus.PROGRAMADA,
];

export interface BacklogGroup {
  targetSectorId: string | null;
  priority: Priority | null;
  count: number;
}

export function calculateBacklog(workOrders: WorkOrderForIndicators[]): {
  total: number;
  bySectorAndPriority: BacklogGroup[];
} {
  const backlog = workOrders.filter((wo) => BACKLOG_STATUSES.includes(wo.status));

  const groups = new Map<string, BacklogGroup>();
  for (const wo of backlog) {
    const key = `${wo.targetSectorId ?? "—"}::${wo.priority ?? "—"}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, { targetSectorId: wo.targetSectorId, priority: wo.priority, count: 1 });
    }
  }

  return { total: backlog.length, bySectorAndPriority: Array.from(groups.values()) };
}

// ---------------------------------------------------------------------------
// Ciclo de vida (StatusHistory) — Fase B1: gargalos por fase e throughput.
// Desacoplado do Prisma, como WorkOrderForIndicators acima.
// ---------------------------------------------------------------------------
export interface WorkOrderLifecycle {
  id: string;
  status: WorkOrderStatus;
  statusHistory: { toStatus: string; changedAt: Date }[];
}

const TERMINAL_STATUSES: WorkOrderStatus[] = [WorkOrderStatus.ENCERRADA, WorkOrderStatus.CANCELADA];

// Duração de fase (§ decisão de negócio): cada par consecutivo de StatusHistory
// (ordenado por changedAt) atribui sua duração ao toStatus do primeiro elemento
// do par — o status em que a OS estava durante aquele intervalo. Para OS ainda
// não encerradas/canceladas, o intervalo da última transição até `now` também
// conta, marcado como "aberto" (gargalo em tempo real). `now` é injetado pelo
// chamador para manter a função determinística e testável.
export interface PhaseDurationResult {
  byPhase: Array<{
    status: string;
    avgHours: number | null;
    sampleCount: number;
    openCount: number;
  }>;
  oldestOpen: Array<{ status: string; workOrderId: string; hours: number }> | [];
}

export function calculatePhaseDurations(
  workOrders: WorkOrderLifecycle[],
  now: Date
): PhaseDurationResult {
  const intervalsByPhase = new Map<string, Array<{ hours: number; open: boolean }>>();
  const oldestOpenByPhase = new Map<string, { workOrderId: string; hours: number }>();

  for (const wo of workOrders) {
    const history = [...wo.statusHistory].sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());

    for (let i = 0; i < history.length - 1; i++) {
      const hours = hoursBetween(history[i].changedAt, history[i + 1].changedAt);
      if (hours <= 0) continue;
      const list = intervalsByPhase.get(history[i].toStatus) ?? [];
      list.push({ hours, open: false });
      intervalsByPhase.set(history[i].toStatus, list);
    }

    if (history.length >= 1 && !TERMINAL_STATUSES.includes(wo.status)) {
      const last = history[history.length - 1];
      const hours = hoursBetween(last.changedAt, now);
      if (hours > 0) {
        const list = intervalsByPhase.get(wo.status) ?? [];
        list.push({ hours, open: true });
        intervalsByPhase.set(wo.status, list);

        const current = oldestOpenByPhase.get(wo.status);
        if (!current || hours > current.hours) {
          oldestOpenByPhase.set(wo.status, { workOrderId: wo.id, hours });
        }
      }
    }
  }

  const byPhase = Array.from(intervalsByPhase.entries()).map(([status, intervals]) => ({
    status,
    avgHours: intervals.reduce((sum, i) => sum + i.hours, 0) / intervals.length,
    sampleCount: intervals.length,
    openCount: intervals.filter((i) => i.open).length,
  }));

  const oldestOpen = Array.from(oldestOpenByPhase.entries()).map(([status, entry]) => ({
    status,
    workOrderId: entry.workOrderId,
    hours: entry.hours,
  }));

  return { byPhase, oldestOpen };
}

// Throughput (§ decisão de negócio): conta OS que possuem uma transição para
// ENCERRADA cujo changedAt cai dentro de [from, to]. Agrupamento mensal em UTC
// (getUTCFullYear/getUTCMonth) para não depender do fuso do servidor.
export interface ThroughputResult {
  total: number;
  byMonth: Array<{ month: string; count: number }>;
}

export function calculateThroughput(
  workOrders: WorkOrderLifecycle[],
  from: Date | null,
  to: Date | null
): ThroughputResult {
  const monthCounts = new Map<string, number>();
  let total = 0;

  for (const wo of workOrders) {
    const history = [...wo.statusHistory].sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());
    const closedAt = history.find(
      (entry) =>
        entry.toStatus === WorkOrderStatus.ENCERRADA &&
        (!from || entry.changedAt >= from) &&
        (!to || entry.changedAt <= to)
    );
    if (!closedAt) continue;

    total += 1;
    const month = `${closedAt.changedAt.getUTCFullYear()}-${String(closedAt.changedAt.getUTCMonth() + 1).padStart(2, "0")}`;
    monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);
  }

  const byMonth = Array.from(monthCounts.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return { total, byMonth };
}

// ---------------------------------------------------------------------------
// Distribuição (status / tipo / técnico) — Fase 3.B: shape desacoplado do
// Prisma, como WorkOrderForIndicators acima. `assignedToName` é resolvido no
// service via include e passado já pronto para manter esta função pura.
// ---------------------------------------------------------------------------
export interface WorkOrderDistribution {
  id: string;
  status: WorkOrderStatus;
  type: WorkOrderType;
  assignedToId: string | null;
  assignedToName: string | null;
  createdAt: Date;
}

export interface DistributionResult {
  byStatus: Array<{ status: string; count: number }>;
  byType: Array<{ type: string; count: number }>;
  byTechnician: Array<{ technicianId: string; technicianName: string; closedCount: number }>;
}

// byStatus/byType: só chaves com count > 0 (não emite zeros para status/tipos
// ausentes no conjunto filtrado). byTechnician: técnico canônico é
// WorkOrder.assignedToId (responsável principal) — WorkOrderAssignee (N:N de
// apoio) não entra aqui; só conta OS ENCERRADA com assignedToId preenchido.
export function calculateDistribution(workOrders: WorkOrderDistribution[]): DistributionResult {
  const statusCounts = new Map<string, number>();
  const typeCounts = new Map<string, number>();
  const technicianCounts = new Map<string, { technicianName: string; closedCount: number }>();

  for (const wo of workOrders) {
    statusCounts.set(wo.status, (statusCounts.get(wo.status) ?? 0) + 1);
    typeCounts.set(wo.type, (typeCounts.get(wo.type) ?? 0) + 1);

    if (wo.status === WorkOrderStatus.ENCERRADA && wo.assignedToId) {
      const existing = technicianCounts.get(wo.assignedToId);
      technicianCounts.set(wo.assignedToId, {
        technicianName: wo.assignedToName ?? existing?.technicianName ?? "",
        closedCount: (existing?.closedCount ?? 0) + 1,
      });
    }
  }

  const byStatus = Array.from(statusCounts.entries()).map(([status, count]) => ({ status, count }));
  const byType = Array.from(typeCounts.entries()).map(([type, count]) => ({ type, count }));
  const byTechnician = Array.from(technicianCounts.entries())
    .map(([technicianId, { technicianName, closedCount }]) => ({ technicianId, technicianName, closedCount }))
    .sort((a, b) => b.closedCount - a.closedCount || a.technicianName.localeCompare(b.technicianName));

  return { byStatus, byType, byTechnician };
}

// ---------------------------------------------------------------------------
// Tendência (§ decisão de negócio): compara contagem de OS criadas no período
// atual vs. período anterior de mesma largura. Recebe as contagens já
// calculadas pelo service (mantém a função pura, sem refazer query).
// ---------------------------------------------------------------------------
export interface TrendResult {
  currentCount: number;
  previousCount: number;
  deltaPercent: number | null;
}

export function calculateTrend(currentCount: number, previousCount: number): TrendResult {
  const deltaPercent =
    previousCount === 0 ? null : Math.round(((currentCount - previousCount) / previousCount) * 1000) / 10;

  return { currentCount, previousCount, deltaPercent };
}
