import { MaintenancePlanWithDueDate } from "../../types";
import { DISCIPLINE_COLORS } from "../../domain/labels";
import { isSameDay, toDateKey } from "../../lib/calendar";
import { EmptyState } from "../../components/EmptyState";

interface CalendarListViewProps {
  days: Date[];
  today: Date;
  eventsByDay: Map<string, MaintenancePlanWithDueDate[]>;
}

// Vista compartilhada por Semana e Dia — para os planos, só a data importa
// (não têm horário), então uma lista por dia é mais legível que reproduzir a
// grade de horas do iCloud.
export function CalendarListView({ days, today, eventsByDay }: CalendarListViewProps) {
  return (
    <div className="space-y-3">
      {days.map((day) => {
        const events = eventsByDay.get(toDateKey(day)) ?? [];
        return (
          <div key={toDateKey(day)} className="overflow-hidden rounded-lg border border-slate-200">
            <div
              className={`border-b border-slate-200 px-3 py-2 text-sm font-medium ${
                isSameDay(day, today) ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-700"
              }`}
            >
              {day.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
            </div>

            {events.length === 0 ? (
              <p className="px-3 py-3 text-sm text-slate-400">Nenhuma preventiva.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {events.map((plan) => {
                  const colors = DISCIPLINE_COLORS[plan.discipline];
                  return (
                    <li
                      key={plan.id}
                      className={`flex items-center gap-2 px-3 py-2 text-sm ${
                        plan.isOverdue ? "bg-red-50" : ""
                      }`}
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${colors.dot}`} aria-hidden="true" />
                      <span className="flex-1 truncate text-slate-800">{plan.title}</span>
                      <span className="shrink-0 truncate text-xs text-slate-500">{plan.asset.name}</span>
                      {plan.isOverdue && <span className="shrink-0 text-xs font-medium text-red-600">⚠ Vencido</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}

      {days.length === 0 && <EmptyState title="Nenhum dia no período selecionado" />}
    </div>
  );
}
