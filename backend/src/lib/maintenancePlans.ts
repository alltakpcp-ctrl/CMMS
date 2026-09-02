// Cálculo de vencimento de MaintenancePlan — função pura, desacoplada do
// Prisma (mesmo molde de lib/indicators.ts). Vencimento é calculado sob
// demanda (sem cron, ver CLAUDE.md §5): próxima data = última Execution
// encerrada vinculada ao plano + intervalo em dias do período; se nunca
// executado, usa MaintenancePlan.createdAt + intervalo. A data de vencimento
// é sempre ajustada para o próximo dia útil.
import { MaintenancePeriodicity, PERIODICITY_DAYS } from "../domain/enums";
import { nextBusinessDay } from "./businessDays";

export interface MaintenancePlanForDueDate {
  id: string;
  periodicity: MaintenancePeriodicity;
  createdAt: Date;
}

// finishedAt da última Execution encerrada vinculada ao plano — já filtrado
// por quem chama (workOrder.status === ENCERRADA), ver seção 5 do prompt de
// implementação.
export interface LastValidExecution {
  finishedAt: Date;
}

export interface DueDateResult {
  dueDate: Date; // já ajustada para o próximo dia útil, se necessário
  isOverdue: boolean;
  deadline: Date | null; // só preenchido se isOverdue
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  const result = startOfUtcDay(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function calculateNextDueDate(
  plan: MaintenancePlanForDueDate,
  lastExecution: LastValidExecution | null,
  referenceDate: Date = new Date()
): DueDateResult {
  const base = lastExecution?.finishedAt ?? plan.createdAt;
  const periodicityDays = PERIODICITY_DAYS[plan.periodicity];

  const dueDateRaw = addUtcDays(base, periodicityDays);
  const dueDate = nextBusinessDay(dueDateRaw);

  const isOverdue = startOfUtcDay(referenceDate).getTime() > dueDate.getTime();
  const deadline = isOverdue ? nextBusinessDay(addUtcDays(dueDate, 1)) : null;

  return { dueDate, isOverdue, deadline };
}
