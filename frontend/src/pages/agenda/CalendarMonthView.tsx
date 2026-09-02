import { MaintenancePlanWithDueDate } from "../../types";
import { DISCIPLINE_COLORS } from "../../domain/labels";
import { WEEKDAY_LABELS, isSameDay, isSameMonth, toDateKey } from "../../lib/calendar";

const MAX_EVENTS_PER_CELL = 3;

interface CalendarMonthViewProps {
  weeks: Date[][];
  reference: Date;
  today: Date;
  eventsByDay: Map<string, MaintenancePlanWithDueDate[]>;
  onEventClick: (plan: MaintenancePlanWithDueDate, anchorRect: DOMRect) => void;
}

export function CalendarMonthView({ weeks, reference, today, eventsByDay, onEventClick }: CalendarMonthViewProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="px-2 py-2 text-center text-xs font-medium text-slate-500">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {weeks.flatMap((week) =>
          week.map((day) => {
            const events = eventsByDay.get(toDateKey(day)) ?? [];
            const visible = events.slice(0, MAX_EVENTS_PER_CELL);
            const hidden = events.length - visible.length;

            return (
              <div
                key={toDateKey(day)}
                className={`min-h-[110px] border-b border-r border-slate-200 p-1.5 last:border-r-0 ${
                  isSameMonth(day, reference) ? "bg-white" : "bg-slate-50"
                }`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    isSameDay(day, today)
                      ? "bg-slate-900 font-semibold text-white"
                      : isSameMonth(day, reference)
                      ? "text-slate-700"
                      : "text-slate-400"
                  }`}
                >
                  {day.getDate()}
                </span>

                <div className="mt-1 space-y-1">
                  {visible.map((plan) => {
                    const colors = DISCIPLINE_COLORS[plan.discipline];
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        title={plan.title}
                        onClick={(e) => onEventClick(plan, e.currentTarget.getBoundingClientRect())}
                        className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-xs font-medium ${colors.bg} ${colors.text} ${
                          plan.isOverdue ? "ring-1 ring-inset ring-red-500" : ""
                        }`}
                      >
                        {plan.isOverdue && "⚠ "}
                        {plan.title}
                      </button>
                    );
                  })}
                  {hidden > 0 && <p className="px-1.5 text-xs text-slate-500">+{hidden} mais</p>}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
