import { Priority, Sector, WorkOrderStatus, WorkOrderType } from "../domain/enums";

// Formato mínimo de OS necessário para os cálculos — mantém as funções puras
// e testáveis sem depender do Prisma (§4.1 da spec 04).
export interface WorkOrderForIndicators {
  id: string;
  assetId: string;
  type: WorkOrderType;
  status: WorkOrderStatus;
  targetSector: Sector | null;
  priority: Priority | null;
  scheduledStart: Date | null;
  execution: { startedAt: Date | null; finishedAt: Date | null } | null;
}

const MS_PER_HOUR = 1000 * 60 * 60;

function hoursBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / MS_PER_HOUR;
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
  const qualifying = workOrders.filter(
    (wo) => wo.status === WorkOrderStatus.ENCERRADA && wo.execution?.startedAt && wo.execution?.finishedAt
  );

  const overall = summarizeHours(
    qualifying.map((wo) => hoursBetween(wo.execution!.startedAt!, wo.execution!.finishedAt!))
  );

  const byAssetMap = new Map<string, number[]>();
  for (const wo of qualifying) {
    const hours = hoursBetween(wo.execution!.startedAt!, wo.execution!.finishedAt!);
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
  const failures = workOrders.filter(
    (wo) =>
      wo.status === WorkOrderStatus.ENCERRADA &&
      wo.type === WorkOrderType.CORRETIVA &&
      wo.execution?.startedAt &&
      wo.execution?.finishedAt
  );

  const overall = summarizeMtbf(failures);

  const byAssetMap = new Map<string, WorkOrderForIndicators[]>();
  for (const wo of failures) {
    const list = byAssetMap.get(wo.assetId) ?? [];
    list.push(wo);
    byAssetMap.set(wo.assetId, list);
  }

  const byAsset = Array.from(byAssetMap.entries()).map(([assetId, list]) => ({
    assetId,
    ...summarizeMtbf(list),
  }));

  return { overall, byAsset };
}

function summarizeMtbf(failures: WorkOrderForIndicators[]): MtbfResult {
  if (failures.length === 0) return { hours: null, failureCount: 0 };

  const sorted = [...failures].sort(
    (a, b) => a.execution!.startedAt!.getTime() - b.execution!.startedAt!.getTime()
  );

  const totalRepairHours = sorted.reduce(
    (sum, wo) => sum + hoursBetween(wo.execution!.startedAt!, wo.execution!.finishedAt!),
    0
  );
  const totalObservedHours = hoursBetween(
    sorted[0].execution!.startedAt!,
    sorted[sorted.length - 1].execution!.finishedAt!
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
  const onTime = scheduled.filter(
    (wo) => wo.execution?.startedAt && isSameCalendarDay(wo.execution.startedAt, wo.scheduledStart!)
  );

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
  targetSector: Sector | null;
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
    const key = `${wo.targetSector ?? "—"}::${wo.priority ?? "—"}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, { targetSector: wo.targetSector, priority: wo.priority, count: 1 });
    }
  }

  return { total: backlog.length, bySectorAndPriority: Array.from(groups.values()) };
}
