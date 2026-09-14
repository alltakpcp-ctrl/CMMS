// Cópia deliberada de backend/src/lib/businessDays.ts — mesma regra de dias
// úteis/feriados nacionais, usada só para projetar visualmente no calendário
// os próximos compromissos de um MaintenancePlan (ver
// MaintenanceCalendar.tsx). Não é fonte de verdade: a data real de cada
// ciclo continua sendo calculada no backend (calculateNextDueDate) a partir
// do fechamento efetivo do ciclo anterior — duplicada aqui em vez de
// importada porque frontend e backend são builds TypeScript separados.

const FIXED_HOLIDAYS: [number, number][] = [
  [0, 1], // Confraternização Universal
  [3, 21], // Tiradentes
  [4, 1], // Dia do Trabalho
  [8, 7], // Independência
  [9, 12], // Nossa Senhora Aparecida
  [10, 2], // Finados
  [10, 15], // Proclamação da República
  [11, 25], // Natal
];

function isSameUtcDate(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export function addUtcDays(date: Date, days: number): Date {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function calculateEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function movableHolidays(year: number): Date[] {
  const easter = calculateEaster(year);
  return [
    addUtcDays(easter, -48),
    addUtcDays(easter, -47),
    addUtcDays(easter, -2),
    addUtcDays(easter, 60),
  ];
}

export function isHoliday(date: Date): boolean {
  const isFixed = FIXED_HOLIDAYS.some(
    ([month, day]) => date.getUTCMonth() === month && date.getUTCDate() === day
  );
  if (isFixed) return true;

  return movableHolidays(date.getUTCFullYear()).some((holiday) => isSameUtcDate(holiday, date));
}

export function isBusinessDay(date: Date): boolean {
  const dayOfWeek = date.getUTCDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  return !isHoliday(date);
}

export function nextBusinessDay(date: Date): Date {
  let current = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  while (!isBusinessDay(current)) {
    current = addUtcDays(current, 1);
  }
  return current;
}
