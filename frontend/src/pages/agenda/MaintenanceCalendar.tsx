import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import * as maintenancePlansApi from "../../api/maintenancePlans";
import { MaintenancePlanWithDueDate } from "../../types";
import { Button } from "../../components/Button";
import { getErrorMessage } from "../../lib/errors";
import { useToast } from "../../components/ToastProvider";
import { addDays, addMonths, getMonthMatrix, getWeekDays, isoDateKey, startOfToday } from "../../lib/calendar";
import { CalendarMonthView } from "./CalendarMonthView";
import { CalendarListView } from "./CalendarListView";

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
  const { showError } = useToast();

  const [view, setView] = useState<CalendarView>("month");
  const [reference, setReference] = useState<Date>(startOfToday());
  const [plans, setPlans] = useState<MaintenancePlanWithDueDate[]>([]);
  const [loading, setLoading] = useState(true);

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

  const eventsByDay = useMemo(() => {
    const map = new Map<string, MaintenancePlanWithDueDate[]>();
    for (const plan of plans) {
      const key = isoDateKey(plan.dueDate);
      const list = map.get(key);
      if (list) {
        list.push(plan);
      } else {
        map.set(key, [plan]);
      }
    }
    return map;
  }, [plans]);

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

      {loading && plans.length === 0 ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : view === "month" ? (
        <CalendarMonthView weeks={getMonthMatrix(reference)} reference={reference} today={today} eventsByDay={eventsByDay} />
      ) : (
        <CalendarListView days={view === "week" ? getWeekDays(reference) : [reference]} today={today} eventsByDay={eventsByDay} />
      )}
    </div>
  );
}
