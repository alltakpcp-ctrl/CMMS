// Helpers de data pura para a grade do calendário de MaintenancePlan. Dias de
// grade sempre em componentes LOCAIS (getFullYear/getMonth/getDate) — a
// grade tem que bater com o calendário de parede de quem está olhando.
// dueDate/deadline vêm do backend como ISO à meia-noite UTC representando só
// uma data (sem hora nenhuma com significado) — a forma segura de casar um
// evento com uma célula da grade é comparar a substring YYYY-MM-DD da ISO
// string direto (isoDateKey), nunca reconstruir via `new Date(iso)` e ler
// getDate() local (isso pode voltar um dia por causa do fuso).

export const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function isoDateKey(iso: string): string {
  return iso.slice(0, 10);
}

export function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

// Domingo da semana que contém `date`.
export function startOfWeek(date: Date): Date {
  return addDays(date, -date.getDay());
}

// 7 dias da semana que contém `date`, começando no domingo.
export function getWeekDays(date: Date): Date[] {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

// Semanas completas (7 dias cada) cobrindo o mês de `reference`, incluindo os
// dias de meses vizinhos que completam a primeira/última semana — mesma
// lógica de grade do iCloud Calendar.
export function getMonthMatrix(reference: Date): Date[][] {
  const firstOfMonth = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const lastOfMonth = new Date(reference.getFullYear(), reference.getMonth() + 1, 0);

  const gridStart = startOfWeek(firstOfMonth);
  const gridEnd = addDays(startOfWeek(lastOfMonth), 6);

  const weeks: Date[][] = [];
  let week: Date[] = [];
  for (let cursor = gridStart; cursor.getTime() <= gridEnd.getTime(); cursor = addDays(cursor, 1)) {
    week.push(cursor);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  return weeks;
}
