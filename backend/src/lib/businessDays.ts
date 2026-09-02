// Dias úteis e feriados nacionais brasileiros — usado pelo cálculo de
// vencimento de MaintenancePlan (lib/maintenancePlans.ts). Função pura, sem
// dependência de Prisma. Datas são tratadas por componentes UTC (ano/mês/dia)
// para não depender do fuso horário do processo.

// Feriados nacionais fixos (mês é 0-indexed).
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

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

// Data da Páscoa (domingo) via algoritmo de Meeus/Jones/Butcher — calendário
// Gregoriano, válido para qualquer ano.
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
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = março, 4 = abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

// Feriados móveis derivados da Páscoa: Carnaval (segunda e terça), Sexta-feira
// Santa e Corpus Christi.
function movableHolidays(year: number): Date[] {
  const easter = calculateEaster(year);
  return [
    addUtcDays(easter, -48), // Carnaval (segunda)
    addUtcDays(easter, -47), // Carnaval (terça)
    addUtcDays(easter, -2), // Sexta-feira Santa
    addUtcDays(easter, 60), // Corpus Christi
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

// Avança até o próximo dia útil (feriado/fim de semana). Se a própria data já
// for dia útil, retorna ela mesma (cópia).
export function nextBusinessDay(date: Date): Date {
  let current = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  while (!isBusinessDay(current)) {
    current = addUtcDays(current, 1);
  }
  return current;
}
