import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import * as maintenancePlansApi from "../../api/maintenancePlans";
import { MaintenancePlanWithDueDate } from "../../types";
import { MaintenancePeriodicity, PERIODICITY_DAYS, Priority } from "../../domain/enums";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { getErrorMessage } from "../../lib/errors";
import { useToast } from "../../components/ToastProvider";
import { addDays, addMonths, getMonthMatrix, getWeekDays, isoDateKey, startOfToday } from "../../lib/calendar";
import { addUtcDays, nextBusinessDay } from "../../lib/businessDays";
import { CalendarMonthView } from "./CalendarMonthView";
import { CalendarListView } from "./CalendarListView";
import { CalendarSidebarFilters } from "./CalendarSidebarFilters";
import { MaintenancePlanEventPopover } from "./MaintenancePlanEventPopover";
import { MaintenancePlanModal } from "../MaintenancePlanModal";
import { GerarOsForm } from "./GerarOsForm";

type ModalState = { mode: "create" } | { mode: "edit"; planId: string };

type CalendarView = "month" | "week" | "day";

const VIEW_LABELS: Record<CalendarView, string> = {
  month: "Mês",
  week: "Semana",
  day: "Dia",
};

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatPeriodLabel(view: CalendarView, reference: Date): string {
  if (view === "month") {
    return capitalize(reference.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }));
  }
  if (view === "day") {
    return capitalize(reference.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }));
  }
  const days = getWeekDays(reference);
  const start = days[0];
  const end = days[6];
  const sameMonth = start.getMonth() === end.getMonth();
  const startLabel = start.toLocaleDateString("pt-BR", { day: "2-digit", month: sameMonth ? undefined : "short" });
  const endLabel = end.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  return `${startLabel} – ${endLabel}`;
}

export function MaintenanceCalendar() {
  const { token } = useAuth();
  const { showError, showSuccess } = useToast();

  const [view, setView] = useState<CalendarView>("month");
  const [reference, setReference] = useState<Date>(startOfToday());
  const [plans, setPlans] = useState<MaintenancePlanWithDueDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [excludedAssetIds, setExcludedAssetIds] = useState<Set<string>>(new Set());
  const [excludedPriorities, setExcludedPriorities] = useState<Set<Priority>>(new Set());
  const [popover, setPopover] = useState<{ plan: MaintenancePlanWithDueDate; anchorRect: DOMRect } | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [generateModal, setGenerateModal] = useState<{ planId: string } | null>(null);

  function handleEventClick(plan: MaintenancePlanWithDueDate, anchorRect: DOMRect) {
    setPopover({ plan, anchorRect });
  }

  function handleGenerateOsSuccess(workOrder: { number: string }) {
    setGenerateModal(null);
    showSuccess(`OS ${workOrder.number} gerada e programada com sucesso.`);
    reload();
  }

  function reload() {
    if (!token) return;
    setLoading(true);
    maintenancePlansApi
      .listMaintenancePlans(token)
      .then(setPlans)
      .catch((err) => showError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }

  useEffect(reload, [token]);

  // Ativos com pelo menos 1 plano — a lista de planos já traz o asset
  // completo (include: { asset: true } no backend), então não precisa de uma
  // segunda chamada a listAssets() só pra cruzar ids.
  const assetsWithPlans = useMemo(() => {
    const byId = new Map<string, string>();
    for (const plan of plans) {
      byId.set(plan.assetId, plan.asset.name);
    }
    return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [plans]);

  function toggleAsset(assetId: string) {
    setExcludedAssetIds((current) => {
      const next = new Set(current);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  }

  function togglePriority(priority: Priority) {
    setExcludedPriorities((current) => {
      const next = new Set(current);
      if (next.has(priority)) next.delete(priority);
      else next.add(priority);
      return next;
    });
  }

  const filteredPlans = useMemo(
    () => plans.filter((plan) => !excludedAssetIds.has(plan.assetId) && !excludedPriorities.has(plan.priority)),
    [plans, excludedAssetIds, excludedPriorities]
  );

  // Planos rascunho (periodicity null — criados quando um OPERADOR abre uma
  // OS PREVENTIVA sem plano prévio) não têm vencimento e não entram na grade
  // do calendário; ficam numa lista à parte até o supervisor completar a
  // periodicidade (editando o plano).
  const draftPlans = useMemo(() => filteredPlans.filter((plan) => plan.dueDate === null), [filteredPlans]);
  const scheduledPlans = useMemo(() => filteredPlans.filter((plan) => plan.dueDate !== null), [filteredPlans]);

  // Início/fim (componentes UTC, só a data importa) do período atualmente
  // visível no calendário — usado para projetar as ocorrências futuras de
  // cada plano recorrente (ver eventsByDay abaixo). Cresce/encolhe conforme
  // o usuário navega (mês/semana/dia), então a projeção nunca é ilimitada.
  const visibleRange = useMemo(() => {
    function toUtcDay(date: Date): Date {
      return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    }
    if (view === "month") {
      const weeks = getMonthMatrix(reference);
      return { start: toUtcDay(weeks[0][0]), end: toUtcDay(weeks[weeks.length - 1][6]) };
    }
    if (view === "week") {
      const days = getWeekDays(reference);
      return { start: toUtcDay(days[0]), end: toUtcDay(days[6]) };
    }
    const day = toUtcDay(reference);
    return { start: day, end: day };
  }, [view, reference]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, MaintenancePlanWithDueDate[]>();

    function addEvent(key: string, plan: MaintenancePlanWithDueDate) {
      const list = map.get(key);
      if (list) list.push(plan);
      else map.set(key, [plan]);
    }

    for (const plan of scheduledPlans) {
      // Enquanto houver uma OS já agendada para o plano, o ciclo real é
      // posicionado na data de início programado dela — não na data de
      // vencimento calculada (que passa a valer de novo só depois que a OS
      // é encerrada e um novo ciclo ainda não foi gerado).
      const anchorIso = plan.openWorkOrder?.scheduledStart ?? plan.dueDate;
      if (!anchorIso) continue;
      const anchor = new Date(anchorIso);
      // Truncado para meia-noite UTC só para a aritmética de dias abaixo —
      // evita que a hora real de um openWorkOrder.scheduledStart (que não é
      // necessariamente meia-noite) distorça a divisão por dias e pule por
      // engano a 1ª ocorrência da faixa visível. O evento real (k=0)
      // continua usando `anchor` (com a hora original) para não mudar o
      // comportamento existente.
      const anchorDay = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()));
      const intervalDays = PERIODICITY_DAYS[plan.periodicity as MaintenancePeriodicity];

      // Réplica visual do compromisso a cada distância da periodicidade,
      // dentro do período visível — aproximação de planejamento (assume que
      // cada ciclo futuro fecha exatamente no vencimento; o vencimento real
      // de cada ciclo só é recalculado no backend quando o ciclo anterior de
      // fato encerra, podendo antecipar/atrasar as ocorrências seguintes).
      // k=0 é sempre o ciclo real (dueDate/openWorkOrder do backend); k>=1
      // são só projeção, sem ação de "Gerar OS" (ver MaintenancePlanEventPopover).
      const msPerDay = 24 * 60 * 60 * 1000;
      const daysFromAnchorToRangeStart = Math.round(
        (visibleRange.start.getTime() - anchorDay.getTime()) / msPerDay
      );
      const startK = Math.max(0, Math.ceil(daysFromAnchorToRangeStart / intervalDays));

      for (let k = startK; ; k++) {
        const occurrence = k === 0 ? anchor : nextBusinessDay(addUtcDays(anchorDay, k * intervalDays));
        if (occurrence.getTime() > visibleRange.end.getTime()) break;
        if (occurrence.getTime() < visibleRange.start.getTime()) continue;

        const key = isoDateKey(occurrence.toISOString());
        if (k === 0) {
          addEvent(key, plan);
        } else {
          addEvent(key, {
            ...plan,
            dueDate: occurrence.toISOString(),
            openWorkOrder: null,
            isOverdue: false,
            deadline: null,
            isProjected: true,
          });
        }
      }
    }
    return map;
  }, [scheduledPlans, visibleRange]);

  const today = startOfToday();

  function goToPrevious() {
    if (view === "month") setReference((ref) => addMonths(ref, -1));
    else if (view === "week") setReference((ref) => addDays(ref, -7));
    else setReference((ref) => addDays(ref, -1));
  }

  function goToNext() {
    if (view === "month") setReference((ref) => addMonths(ref, 1));
    else if (view === "week") setReference((ref) => addDays(ref, 7));
    else setReference((ref) => addDays(ref, 1));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Calendário de preventivas</h2>
          <p className="text-sm text-slate-500">{formatPeriodLabel(view, reference)}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setModal({ mode: "create" })}>Adicionar preventiva</Button>

          <div className="flex overflow-hidden rounded border border-slate-300">
            {(Object.keys(VIEW_LABELS) as CalendarView[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-sm font-medium ${
                  view === v ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <Button variant="secondary" onClick={goToPrevious} aria-label="Período anterior">
              ‹
            </Button>
            <Button variant="secondary" onClick={() => setReference(startOfToday())}>
              Hoje
            </Button>
            <Button variant="secondary" onClick={goToNext} aria-label="Próximo período">
              ›
            </Button>
          </div>

          <Button variant="secondary" onClick={reload} disabled={loading}>
            {loading ? "Atualizando…" : "Atualizar"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <CalendarSidebarFilters
          assets={assetsWithPlans}
          excludedAssetIds={excludedAssetIds}
          onToggleAsset={toggleAsset}
          excludedPriorities={excludedPriorities}
          onTogglePriority={togglePriority}
        />

        <div className="flex-1">
          {loading && plans.length === 0 ? (
            <p className="text-sm text-slate-500">Carregando…</p>
          ) : view === "month" ? (
            <CalendarMonthView
              weeks={getMonthMatrix(reference)}
              reference={reference}
              today={today}
              eventsByDay={eventsByDay}
              onEventClick={handleEventClick}
            />
          ) : (
            <CalendarListView
              days={view === "week" ? getWeekDays(reference) : [reference]}
              today={today}
              eventsByDay={eventsByDay}
              onEventClick={handleEventClick}
            />
          )}
        </div>
      </div>

      {draftPlans.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 p-3">
          <p className="mb-2 text-sm font-medium text-amber-900">
            Rascunhos pendentes de periodicidade ({draftPlans.length})
          </p>
          <ul className="space-y-1">
            {draftPlans.map((plan) => (
              <li key={plan.id} className="flex items-center justify-between gap-2 text-sm text-amber-900">
                <span>
                  {plan.title} — {plan.asset.name}
                </span>
                <button
                  className="text-amber-700 underline hover:text-amber-900"
                  onClick={() => setModal({ mode: "edit", planId: plan.id })}
                >
                  Completar plano
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {popover && (
        <MaintenancePlanEventPopover
          plan={popover.plan}
          anchorRect={popover.anchorRect}
          onClose={() => setPopover(null)}
          onEdit={() => {
            setModal({ mode: "edit", planId: popover.plan.id });
            setPopover(null);
          }}
          onGenerateWorkOrder={() => {
            setGenerateModal({ planId: popover.plan.id });
            setPopover(null);
          }}
        />
      )}

      {modal && (
        <MaintenancePlanModal
          planId={modal.mode === "edit" ? modal.planId : undefined}
          onClose={() => setModal(null)}
          onSaved={reload}
        />
      )}

      {generateModal && (
        <Modal title="Gerar OS a partir do plano" onClose={() => setGenerateModal(null)}>
          <GerarOsForm
            planId={generateModal.planId}
            onSuccess={handleGenerateOsSuccess}
            onClose={() => setGenerateModal(null)}
          />
        </Modal>
      )}
    </div>
  );
}
