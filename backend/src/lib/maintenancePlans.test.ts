import { describe, expect, it } from "vitest";
import { calculateNextDueDate, MaintenancePlanForDueDate } from "./maintenancePlans";

function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function plan(overrides: Partial<MaintenancePlanForDueDate>): MaintenancePlanForDueDate {
  return {
    id: "plan-1",
    periodicity: "SEMANAL",
    createdAt: utc(2026, 1, 1),
    ...overrides,
  };
}

describe("calculateNextDueDate", () => {
  it("calcula vencimento em dia útil normal, sem ajuste", () => {
    // 01/01/2026 é quinta-feira; +7 dias = 08/01/2026, também quinta-feira, sem feriado.
    const result = calculateNextDueDate(
      plan({ periodicity: "SEMANAL", createdAt: utc(2026, 1, 1) }),
      null,
      utc(2026, 1, 1)
    );
    expect(result.dueDate.getTime()).toBe(utc(2026, 1, 8).getTime());
    expect(result.isOverdue).toBe(false);
    expect(result.deadline).toBeNull();
  });

  it("empurra vencimento que cai em fim de semana para a segunda-feira seguinte", () => {
    // última execução em 02/01/2026 (sexta) + 1 dia (DIARIO) = 03/01/2026 (sábado).
    const result = calculateNextDueDate(
      plan({ periodicity: "DIARIO" }),
      { finishedAt: utc(2026, 1, 2) },
      utc(2026, 1, 2)
    );
    expect(result.dueDate.getTime()).toBe(utc(2026, 1, 5).getTime());
  });

  it("empurra vencimento que cai em feriado fixo (25/12) para o próximo dia útil", () => {
    const result = calculateNextDueDate(
      plan({ periodicity: "ANUAL" }),
      { finishedAt: utc(2025, 12, 25) },
      utc(2025, 12, 25)
    );
    // raw = 25/12/2026 (Natal) — dueDate não pode cair nessa data.
    expect(result.dueDate.getTime()).not.toBe(utc(2026, 12, 25).getTime());
    expect(result.dueDate.getTime()).toBeGreaterThan(utc(2026, 12, 25).getTime());
  });

  it("empurra vencimento que cai em feriado móvel (Carnaval 2024) para o próximo dia útil", () => {
    // 13/01/2024 + 30 dias (MENSAL) = 12/02/2024 (Carnaval, segunda) — deve
    // avançar até 14/02/2024 (quarta-feira, primeiro dia útil após o feriado).
    const result = calculateNextDueDate(
      plan({ periodicity: "MENSAL" }),
      { finishedAt: utc(2024, 1, 13) },
      utc(2024, 1, 13)
    );
    expect(result.dueDate.getTime()).toBe(utc(2024, 2, 14).getTime());
  });

  it("usa createdAt do plano quando nunca houve execução", () => {
    const result = calculateNextDueDate(
      plan({ periodicity: "SEMANAL", createdAt: utc(2026, 1, 1) }),
      null,
      utc(2026, 1, 1)
    );
    expect(result.dueDate.getTime()).toBe(utc(2026, 1, 8).getTime());
  });

  it("ignora createdAt quando há última execução válida", () => {
    const result = calculateNextDueDate(
      plan({ periodicity: "SEMANAL", createdAt: utc(2020, 1, 1) }),
      { finishedAt: utc(2026, 1, 1) },
      utc(2026, 1, 1)
    );
    expect(result.dueDate.getTime()).toBe(utc(2026, 1, 8).getTime());
  });

  it("marca como vencido (isOverdue) e calcula deadline quando referenceDate é posterior ao vencimento", () => {
    const result = calculateNextDueDate(
      plan({ periodicity: "SEMANAL", createdAt: utc(2026, 1, 1) }),
      null,
      utc(2026, 1, 20) // bem depois do vencimento (08/01/2026)
    );
    expect(result.isOverdue).toBe(true);
    expect(result.deadline).not.toBeNull();
    expect(result.deadline!.getTime()).toBe(result.dueDate.getTime());
  });

  it("não marca como vencido quando referenceDate é igual à data de vencimento", () => {
    const result = calculateNextDueDate(
      plan({ periodicity: "SEMANAL", createdAt: utc(2026, 1, 1) }),
      null,
      utc(2026, 1, 8)
    );
    expect(result.isOverdue).toBe(false);
    expect(result.deadline).toBeNull();
  });
});
