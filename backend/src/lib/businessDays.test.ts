import { describe, expect, it } from "vitest";
import { calculateEaster, isBusinessDay, isHoliday, nextBusinessDay } from "./businessDays";

function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

describe("calculateEaster", () => {
  it("calcula a Páscoa de 2024 corretamente (31/03/2024, valor de referência conhecido)", () => {
    const easter = calculateEaster(2024);
    expect(easter.getUTCFullYear()).toBe(2024);
    expect(easter.getUTCMonth()).toBe(2); // março (0-indexed)
    expect(easter.getUTCDate()).toBe(31);
  });
});

describe("isHoliday", () => {
  it("reconhece feriado fixo (25/12 — Natal)", () => {
    expect(isHoliday(utc(2026, 12, 25))).toBe(true);
  });

  it("não marca um dia comum como feriado", () => {
    expect(isHoliday(utc(2026, 6, 10))).toBe(false);
  });

  it("reconhece o Carnaval de 2024 (feriado móvel, 12 e 13/02/2024)", () => {
    expect(isHoliday(utc(2024, 2, 12))).toBe(true);
    expect(isHoliday(utc(2024, 2, 13))).toBe(true);
  });

  it("reconhece a Sexta-feira Santa de 2024 (29/03/2024)", () => {
    expect(isHoliday(utc(2024, 3, 29))).toBe(true);
  });

  it("reconhece o Corpus Christi de 2024 (30/05/2024)", () => {
    expect(isHoliday(utc(2024, 5, 30))).toBe(true);
  });
});

describe("isBusinessDay", () => {
  it("retorna false para sábado e domingo", () => {
    expect(isBusinessDay(utc(2026, 1, 3))).toBe(false); // sábado
    expect(isBusinessDay(utc(2026, 1, 4))).toBe(false); // domingo
  });

  it("retorna true para dia útil comum", () => {
    expect(isBusinessDay(utc(2026, 1, 5))).toBe(true); // segunda-feira
  });

  it("retorna false para feriado em dia de semana", () => {
    expect(isBusinessDay(utc(2024, 2, 13))).toBe(false); // Carnaval, terça-feira
  });
});

describe("nextBusinessDay", () => {
  it("retorna a própria data quando já é dia útil", () => {
    const result = nextBusinessDay(utc(2026, 1, 5));
    expect(result.getTime()).toBe(utc(2026, 1, 5).getTime());
  });

  it("avança de sábado para a segunda-feira seguinte", () => {
    const result = nextBusinessDay(utc(2026, 1, 3));
    expect(result.getTime()).toBe(utc(2026, 1, 5).getTime());
  });

  it("avança de domingo para a segunda-feira seguinte", () => {
    const result = nextBusinessDay(utc(2026, 1, 4));
    expect(result.getTime()).toBe(utc(2026, 1, 5).getTime());
  });

  it("pula feriados consecutivos (Carnaval segunda+terça de 2024) até a quarta-feira", () => {
    const result = nextBusinessDay(utc(2024, 2, 12));
    expect(result.getTime()).toBe(utc(2024, 2, 14).getTime());
  });

  it("avança de um feriado fixo em dia de semana para o próximo dia útil", () => {
    // 25/12/2026 é sexta-feira — deve pular para a segunda-feira seguinte (28/12),
    // já que 26 e 27 caem no fim de semana.
    const result = nextBusinessDay(utc(2026, 12, 25));
    expect(isBusinessDay(result)).toBe(true);
    expect(result.getTime()).toBeGreaterThan(utc(2026, 12, 25).getTime());
  });
});
