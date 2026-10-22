import { WorkOrderStatus } from "../domain/enums";

// Reconstrução APROXIMADA do StatusHistory perdido no incidente de 2026-09-17
// (todo o histórico anterior a essa data sumiu de produção; o que existia até
// o cutover de 2026-08-18 foi restaurado do dump, o intervalo 18/08–17/09 não
// tem fonte). Para cada OS, procura "buracos" na cadeia de status — falta da
// abertura, fromStatus de uma linha diferente do toStatus da anterior, ou
// último toStatus diferente do status atual — e preenche com as etapas do
// fluxo normal, datadas pelas evidências que sobreviveram:
//   - abertura: WorkOrder.createdAt / requesterId (exata)
//   - EM_EXECUCAO / AGUARDANDO_VALIDACAO: Execution.startedAt/finishedAt e
//     startedById/endedById (exatas)
//   - etapa final do buraco: WorkOrder.updatedAt (aproximada)
//   - triagem/planejamento/programação: interpoladas entre as datas vizinhas
// Etapas sem evidência de que aconteceram (ex.: sem plano → sem PLANEJADA) são
// puladas. Toda linha gerada leva o prefixo RECONSTRUCTION_TAG na nota e,
// quando o autor real é desconhecido, o usuário de fallback informado.

export const RECONSTRUCTION_TAG = "[RECONSTRUÍDO]";

const FLOW: WorkOrderStatus[] = [
  WorkOrderStatus.ABERTA,
  WorkOrderStatus.TRIAGEM,
  WorkOrderStatus.PLANEJADA,
  WorkOrderStatus.PROGRAMADA,
  WorkOrderStatus.EM_EXECUCAO,
  WorkOrderStatus.AGUARDANDO_VALIDACAO,
  WorkOrderStatus.ENCERRADA,
];

export interface ReconstructionWorkOrder {
  id: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  requesterId: string;
  targetSectorId: string | null;
  plan: string | null;
  scheduledStart: Date | null;
  maintenancePlanId: string | null;
  excludedAt: Date | null;
  excludedById: string | null;
  exclusionReason: string | null;
}

export interface ReconstructionHistory {
  fromStatus: string | null;
  toStatus: string;
  changedAt: Date;
  note: string | null;
}

export interface ReconstructionExecution {
  startedAt: Date | null;
  finishedAt: Date | null;
  startedById: string | null;
  endedById: string | null;
}

export interface ReconstructedEntry {
  fromStatus: string | null;
  toStatus: string;
  changedAt: Date;
  changedById: string;
  note: string;
}

interface Anchor {
  status: string;
  at: Date;
}

interface Step {
  toStatus: string;
  at: Date | null; // null = interpolar
  by: string | null; // null = autor desconhecido (fallback)
  basis: string;
}

const basisNote = (basis: string, knownAuthor: boolean) =>
  `${RECONSTRUCTION_TAG} Histórico perdido no incidente de 17/09/2026; data ${basis}` +
  (knownAuthor ? "." : "; autor real desconhecido.");

export function reconstructStatusHistory(
  wo: ReconstructionWorkOrder,
  history: ReconstructionHistory[],
  executions: ReconstructionExecution[],
  fallbackUserId: string,
  // Instante da perda: qualquer transição que de fato faltou aconteceu ANTES
  // dele (as posteriores sobreviveram). Sem isso, a interpolação ou o
  // updatedAt (que muda com edições posteriores) jogavam etapas para depois.
  lostBefore?: Date
): ReconstructedEntry[] {
  const sorted = [...history].sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());
  const execs = executions
    .filter((e) => e.startedAt)
    .sort((a, b) => a.startedAt!.getTime() - b.startedAt!.getTime());
  const out: ReconstructedEntry[] = [];

  const emit = (from: string | null, steps: Step[], start: Date, end: Date) => {
    // Interpola as etapas sem data entre as âncoras vizinhas e garante ordem
    // estritamente crescente (a linha do tempo ordena por changedAt).
    const resolved: Date[] = [];
    let i = 0;
    while (i < steps.length) {
      if (steps[i].at) {
        resolved[i] = steps[i].at!;
        i++;
        continue;
      }
      let j = i;
      while (j < steps.length && !steps[j].at) j++;
      const left = i === 0 ? start : resolved[i - 1];
      const right = j < steps.length ? steps[j].at! : end;
      const span = Math.max(right.getTime() - left.getTime(), 0);
      for (let k = i; k < j; k++) {
        resolved[k] = new Date(left.getTime() + (span * (k - i + 1)) / (j - i + 1));
      }
      i = j;
    }
    let previous = from;
    let lastTime = start.getTime();
    steps.forEach((step, idx) => {
      const time = Math.max(resolved[idx].getTime(), lastTime + 1);
      lastTime = time;
      out.push({
        fromStatus: previous,
        toStatus: step.toStatus,
        changedAt: new Date(time),
        changedById: step.by ?? fallbackUserId,
        note: basisNote(step.basis, step.by !== null),
      });
      previous = step.toStatus;
    });
  };

  const fillGap = (from: Anchor, rawTo: Anchor, isFinalGap: boolean) => {
    const clamp = lostBefore && from.at < lostBefore && rawTo.at > lostBefore;
    const to: Anchor = clamp ? { status: rawTo.status, at: new Date(lostBefore!.getTime() - 1) } : rawTo;
    const fromIdx = FLOW.indexOf(from.status as WorkOrderStatus);
    const cancelling = to.status === WorkOrderStatus.CANCELADA;
    const windowExecs = execs.filter(
      (e) =>
        (e.startedAt! > from.at && e.startedAt! <= to.at) ||
        (e.finishedAt && e.finishedAt > from.at && e.finishedAt <= to.at)
    );

    // Progresso evidenciado dentro da janela (para CANCELADA: até onde a OS
    // chegou antes de ser cancelada).
    let targetIdx: number;
    if (cancelling) {
      const reachedExec = windowExecs.some((e) => e.startedAt! > from.at);
      // cancelar()/excluir() também fecham a Execution, mas sem endedById —
      // só conta como encerramento técnico quem tem autor de encerramento.
      const reachedEnd = windowExecs.some((e) => e.finishedAt && e.finishedAt <= to.at && e.endedById);
      targetIdx = reachedEnd ? FLOW.indexOf(WorkOrderStatus.AGUARDANDO_VALIDACAO) : reachedExec ? FLOW.indexOf(WorkOrderStatus.EM_EXECUCAO) : fromIdx;
    } else {
      targetIdx = FLOW.indexOf(to.status as WorkOrderStatus);
    }

    // Retrocesso (override perdido) ou status fora do fluxo: transição direta.
    if (fromIdx < 0 || targetIdx < 0 || (!cancelling && targetIdx < fromIdx)) {
      emit(from.status, [{ toStatus: to.status, at: clamp ? null : to.at, by: null, basis: "aproximada (provável override do supervisor)" }], from.at, to.at);
      return;
    }

    const steps: Step[] = [];
    // updatedAt só serve de âncora se não foi empurrado para depois da perda.
    const finalAt = isFinalGap && !clamp ? to.at : null;
    for (let idx = fromIdx + 1; idx <= targetIdx; idx++) {
      const status = FLOW[idx];
      switch (status) {
        case WorkOrderStatus.TRIAGEM:
          if (wo.targetSectorId) steps.push({ toStatus: status, at: null, by: null, basis: "interpolada" });
          break;
        case WorkOrderStatus.PLANEJADA:
          if (wo.plan) steps.push({ toStatus: status, at: null, by: null, basis: "interpolada" });
          break;
        case WorkOrderStatus.PROGRAMADA:
          if (wo.scheduledStart || idx === targetIdx) {
            const fromPlan = wo.maintenancePlanId && !wo.plan && !wo.targetSectorId && from.status === WorkOrderStatus.ABERTA;
            steps.push(
              fromPlan
                ? { toStatus: status, at: wo.createdAt, by: wo.requesterId, basis: "exata (OS gerada pelo plano de preventiva)" }
                : { toStatus: status, at: null, by: null, basis: "interpolada" }
            );
          }
          break;
        case WorkOrderStatus.EM_EXECUCAO: {
          const first = windowExecs.find((e) => e.startedAt! > from.at);
          steps.push(
            first
              ? { toStatus: status, at: first.startedAt, by: first.startedById, basis: "exata (início da execução)" }
              : { toStatus: status, at: null, by: null, basis: "interpolada" }
          );
          // Ciclos extras de execução dentro da janela = reprovações na validação.
          const cycles = windowExecs.filter((e) => e.startedAt! > from.at);
          cycles.forEach((cycle, c) => {
            if (c === cycles.length - 1) return;
            if (cycle.finishedAt) {
              steps.push({ toStatus: WorkOrderStatus.AGUARDANDO_VALIDACAO, at: cycle.finishedAt, by: cycle.endedById, basis: "exata (encerramento técnico)" });
            }
            const next = cycles[c + 1];
            steps.push({ toStatus: WorkOrderStatus.EM_EXECUCAO, at: next.startedAt, by: next.startedById, basis: "exata (reabertura da execução após reprovação)" });
          });
          break;
        }
        case WorkOrderStatus.AGUARDANDO_VALIDACAO: {
          const last = [...windowExecs].reverse().find((e) => e.finishedAt && e.finishedAt <= to.at);
          steps.push(
            last
              ? { toStatus: status, at: last.finishedAt, by: last.endedById, basis: "exata (encerramento técnico)" }
              : { toStatus: status, at: null, by: null, basis: "interpolada" }
          );
          break;
        }
        case WorkOrderStatus.ENCERRADA:
          steps.push({ toStatus: status, at: finalAt, by: null, basis: finalAt ? "aproximada (última atualização da OS)" : "interpolada" });
          break;
      }
    }
    if (cancelling) {
      steps.push({ toStatus: to.status, at: finalAt, by: null, basis: finalAt ? "aproximada (última atualização da OS)" : "interpolada" });
    }
    // A última etapa do buraco tem que chegar exatamente no status esperado.
    if (steps.length === 0 || steps[steps.length - 1].toStatus !== to.status) {
      steps.push({ toStatus: to.status, at: finalAt, by: null, basis: finalAt ? "aproximada (última atualização da OS)" : "interpolada" });
    }
    emit(from.status, steps, from.at, to.at);
  };

  let cursor: Anchor | null = null;
  if (!sorted.some((h) => h.fromStatus === null)) {
    out.push({
      fromStatus: null,
      toStatus: WorkOrderStatus.ABERTA,
      changedAt: wo.createdAt,
      changedById: wo.requesterId,
      note: basisNote("exata (abertura da OS)", true),
    });
    cursor = { status: WorkOrderStatus.ABERTA, at: wo.createdAt };
  }

  for (const entry of sorted) {
    if (entry.fromStatus === null) {
      cursor = { status: entry.toStatus, at: entry.changedAt };
      continue;
    }
    if (cursor && cursor.status !== entry.fromStatus) {
      fillGap(cursor, { status: entry.fromStatus, at: entry.changedAt }, false);
    }
    cursor = { status: entry.toStatus, at: entry.changedAt };
  }

  if (cursor && cursor.status !== wo.status) {
    const end = wo.updatedAt > cursor.at ? wo.updatedAt : new Date(cursor.at.getTime() + 1);
    fillGap(cursor, { status: wo.status, at: end }, true);
  }

  // Exclusão lógica feita antes do incidente (mesmo dia 17/09) perdeu a linha
  // de auditoria — os dados dela continuam na própria OS. "[EXCLUSÃO" sem o
  // colchete final cobre também "[EXCLUSÃO EM CASCATA — PLANO]".
  if (wo.excludedAt && wo.excludedById && !sorted.some((h) => h.note?.startsWith("[EXCLUSÃO"))) {
    out.push({
      fromStatus: wo.status,
      toStatus: wo.status,
      changedAt: wo.excludedAt,
      changedById: wo.excludedById,
      note: `[EXCLUSÃO] ${wo.exclusionReason ?? ""} ${RECONSTRUCTION_TAG}`.trim(),
    });
  }

  return out;
}
