import { describe, expect, it } from "vitest";
import {
  calculateAdherence,
  calculateBacklog,
  calculateMtbf,
  calculateMttr,
  WorkOrderForIndicators,
} from "./indicators";
import { Priority, WorkOrderStatus, WorkOrderType } from "../domain/enums";

function wo(overrides: Partial<WorkOrderForIndicators>): WorkOrderForIndicators {
  return {
    id: overrides.id ?? Math.random().toString(36),
    assetId: "asset-1",
    type: WorkOrderType.CORRETIVA,
    status: WorkOrderStatus.ENCERRADA,
    targetSectorId: "sector-mecanica",
    priority: Priority.MEDIA,
    scheduledStart: null,
    executions: [],
    ...overrides,
  };
}

describe("calculateMttr", () => {
  it("retorna null e amostra 0 sem dados", () => {
    const result = calculateMttr([]);
    expect(result.overall).toEqual({ hours: null, sampleSize: 0 });
  });

  it("calcula a média em horas de OS encerradas com execução completa", () => {
    const workOrders = [
      wo({
        executions: [{ startedAt: new Date("2026-01-01T08:00:00Z"), finishedAt: new Date("2026-01-01T10:00:00Z") }],
      }), // 2h
      wo({
        executions: [{ startedAt: new Date("2026-01-02T08:00:00Z"), finishedAt: new Date("2026-01-02T12:00:00Z") }],
      }), // 4h
    ];
    const result = calculateMttr(workOrders);
    expect(result.overall.hours).toBe(3);
    expect(result.overall.sampleSize).toBe(2);
  });

  it("ignora OS não encerradas ou sem execução completa", () => {
    const workOrders = [
      wo({ status: WorkOrderStatus.EM_EXECUCAO, executions: [{ startedAt: new Date(), finishedAt: null }] }),
      wo({ status: WorkOrderStatus.ENCERRADA, executions: [] }),
    ];
    const result = calculateMttr(workOrders);
    expect(result.overall).toEqual({ hours: null, sampleSize: 0 });
  });
});

describe("calculateMtbf", () => {
  it("retorna null sem falhas corretivas encerradas", () => {
    const result = calculateMtbf([]);
    expect(result.overall).toEqual({ hours: null, failureCount: 0 });
  });

  it("calcula MTBF a partir de duas falhas com um intervalo conhecido", () => {
    // Falha 1: 01/01 08:00 -> 10:00 (2h de reparo)
    // Falha 2: 03/01 08:00 -> 09:00 (1h de reparo)
    // Observado total: 03/01 09:00 - 01/01 08:00 = 49h
    // MTBF = (49 - 3) / 2 = 23h
    const workOrders = [
      wo({
        executions: [{ startedAt: new Date("2026-01-01T08:00:00Z"), finishedAt: new Date("2026-01-01T10:00:00Z") }],
      }),
      wo({
        executions: [{ startedAt: new Date("2026-01-03T08:00:00Z"), finishedAt: new Date("2026-01-03T09:00:00Z") }],
      }),
    ];
    const result = calculateMtbf(workOrders);
    expect(result.overall.failureCount).toBe(2);
    expect(result.overall.hours).toBe(23);
  });

  it("ignora OS preventivas/preditivas mesmo se encerradas", () => {
    const workOrders = [
      wo({
        type: WorkOrderType.PREVENTIVA,
        executions: [{ startedAt: new Date("2026-01-01T08:00:00Z"), finishedAt: new Date("2026-01-01T10:00:00Z") }],
      }),
    ];
    const result = calculateMtbf(workOrders);
    expect(result.overall).toEqual({ hours: null, failureCount: 0 });
  });
});

describe("calculateAdherence", () => {
  it("retorna null sem OS programadas", () => {
    const result = calculateAdherence([]);
    expect(result).toEqual({ percentage: null, onTime: 0, totalScheduled: 0 });
  });

  it("calcula percentual de OS iniciadas no dia agendado", () => {
    const workOrders = [
      wo({
        scheduledStart: new Date("2026-01-05T08:00:00Z"),
        executions: [{ startedAt: new Date("2026-01-05T09:30:00Z"), finishedAt: null }],
      }), // no prazo
      wo({
        scheduledStart: new Date("2026-01-06T08:00:00Z"),
        executions: [{ startedAt: new Date("2026-01-07T08:00:00Z"), finishedAt: null }],
      }), // atrasada
      wo({ scheduledStart: new Date("2026-01-08T08:00:00Z"), executions: [] }), // ainda não iniciou
    ];
    const result = calculateAdherence(workOrders);
    expect(result.totalScheduled).toBe(3);
    expect(result.onTime).toBe(1);
    expect(result.percentage).toBeCloseTo(33.33, 1);
  });
});

describe("calculateBacklog", () => {
  it("conta apenas status até PROGRAMADA, agrupando por setor e prioridade", () => {
    const workOrders = [
      wo({ status: WorkOrderStatus.ABERTA, targetSectorId: null, priority: null }),
      wo({ status: WorkOrderStatus.TRIAGEM, targetSectorId: "sector-eletrica", priority: Priority.ALTA }),
      wo({ status: WorkOrderStatus.PROGRAMADA, targetSectorId: "sector-eletrica", priority: Priority.ALTA }),
      wo({ status: WorkOrderStatus.EM_EXECUCAO }),
      wo({ status: WorkOrderStatus.ENCERRADA }),
    ];
    const result = calculateBacklog(workOrders);
    expect(result.total).toBe(3);
    const eletricaAlta = result.bySectorAndPriority.find(
      (g) => g.targetSectorId === "sector-eletrica" && g.priority === Priority.ALTA
    );
    expect(eletricaAlta?.count).toBe(2);
  });
});
