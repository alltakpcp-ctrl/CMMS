import { describe, expect, it } from "vitest";
import {
  calculateAdherence,
  calculateBacklog,
  calculateDistribution,
  calculateMtbf,
  calculateMttr,
  calculatePhaseDurations,
  calculateTechnicianEfficiency,
  calculateThroughput,
  calculateTrend,
  executionDurationHours,
  isAdherent,
  WorkOrderDistribution,
  WorkOrderForIndicators,
  WorkOrderLifecycle,
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
    assignedToId: null,
    assignedToName: null,
    executions: [],
    assignees: [],
    subtasks: [],
    ...overrides,
  };
}

function woLc(overrides: Partial<WorkOrderLifecycle>): WorkOrderLifecycle {
  return {
    id: overrides.id ?? Math.random().toString(36),
    status: WorkOrderStatus.ENCERRADA,
    statusHistory: [],
    ...overrides,
  };
}

function woDist(overrides: Partial<WorkOrderDistribution>): WorkOrderDistribution {
  return {
    id: overrides.id ?? Math.random().toString(36),
    status: WorkOrderStatus.ENCERRADA,
    type: WorkOrderType.CORRETIVA,
    assignedToId: "user-1",
    assignedToName: "Fulano",
    createdAt: new Date("2026-01-01T00:00:00Z"),
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

describe("calculatePhaseDurations", () => {
  it("retorna vazio sem dados", () => {
    const result = calculatePhaseDurations([], new Date("2026-01-01T00:00:00Z"));
    expect(result.byPhase).toEqual([]);
    expect(result.oldestOpen).toEqual([]);
  });

  it("calcula duração média por fase para OS encerrada com sequência completa", () => {
    // ABERTA: 00:00 -> 02:00 = 2h | TRIAGEM: 02:00 -> 05:00 = 3h | PLANEJADA: 05:00 -> 09:00 = 4h
    const workOrders = [
      woLc({
        status: WorkOrderStatus.ENCERRADA,
        statusHistory: [
          { toStatus: WorkOrderStatus.ABERTA, changedAt: new Date("2026-01-01T00:00:00Z") },
          { toStatus: WorkOrderStatus.TRIAGEM, changedAt: new Date("2026-01-01T02:00:00Z") },
          { toStatus: WorkOrderStatus.PLANEJADA, changedAt: new Date("2026-01-01T05:00:00Z") },
          { toStatus: WorkOrderStatus.ENCERRADA, changedAt: new Date("2026-01-01T09:00:00Z") },
        ],
      }),
    ];
    const result = calculatePhaseDurations(workOrders, new Date("2026-02-01T00:00:00Z"));

    expect(result.byPhase.find((p) => p.status === WorkOrderStatus.ABERTA)).toEqual({
      status: WorkOrderStatus.ABERTA,
      avgHours: 2,
      sampleCount: 1,
      openCount: 0,
    });
    expect(result.byPhase.find((p) => p.status === WorkOrderStatus.TRIAGEM)).toEqual({
      status: WorkOrderStatus.TRIAGEM,
      avgHours: 3,
      sampleCount: 1,
      openCount: 0,
    });
    expect(result.byPhase.find((p) => p.status === WorkOrderStatus.PLANEJADA)).toEqual({
      status: WorkOrderStatus.PLANEJADA,
      avgHours: 4,
      sampleCount: 1,
      openCount: 0,
    });
    // ENCERRADA é terminal: não gera intervalo (nem fechado — é o último registro
    // sem próxima transição — nem aberto, pois a OS não está mais "parada").
    expect(result.byPhase.find((p) => p.status === WorkOrderStatus.ENCERRADA)).toBeUndefined();
    expect(result.oldestOpen).toEqual([]);
  });

  it("conta intervalo aberto (gargalo em tempo real) para OS parada na fase atual", () => {
    const now = new Date("2026-01-05T00:00:00Z");
    const workOrders = [
      woLc({
        id: "wo-1",
        status: WorkOrderStatus.PROGRAMADA,
        statusHistory: [
          { toStatus: WorkOrderStatus.ABERTA, changedAt: new Date("2026-01-01T00:00:00Z") },
          { toStatus: WorkOrderStatus.PROGRAMADA, changedAt: new Date("2026-01-04T00:00:00Z") }, // aberto: 24h até `now`
        ],
      }),
    ];
    const result = calculatePhaseDurations(workOrders, now);

    expect(result.byPhase.find((p) => p.status === WorkOrderStatus.PROGRAMADA)).toEqual({
      status: WorkOrderStatus.PROGRAMADA,
      avgHours: 24,
      sampleCount: 1,
      openCount: 1,
    });
    expect(result.oldestOpen).toEqual([{ status: WorkOrderStatus.PROGRAMADA, workOrderId: "wo-1", hours: 24 }]);
  });

  it("ignora OS fechada com um único registro de histórico (sem duração)", () => {
    const workOrders = [
      woLc({
        status: WorkOrderStatus.ENCERRADA,
        statusHistory: [{ toStatus: WorkOrderStatus.ENCERRADA, changedAt: new Date("2026-01-01T00:00:00Z") }],
      }),
    ];
    const result = calculatePhaseDurations(workOrders, new Date("2026-02-01T00:00:00Z"));
    expect(result.byPhase).toEqual([]);
    expect(result.oldestOpen).toEqual([]);
  });

  it("ordena o histórico por changedAt mesmo se a entrada vier fora de ordem", () => {
    const workOrders = [
      woLc({
        status: WorkOrderStatus.ENCERRADA,
        statusHistory: [
          { toStatus: WorkOrderStatus.TRIAGEM, changedAt: new Date("2026-01-01T02:00:00Z") },
          { toStatus: WorkOrderStatus.ABERTA, changedAt: new Date("2026-01-01T00:00:00Z") },
          { toStatus: WorkOrderStatus.ENCERRADA, changedAt: new Date("2026-01-01T05:00:00Z") },
        ],
      }),
    ];
    const result = calculatePhaseDurations(workOrders, new Date("2026-02-01T00:00:00Z"));

    expect(result.byPhase.find((p) => p.status === WorkOrderStatus.ABERTA)?.avgHours).toBe(2);
    expect(result.byPhase.find((p) => p.status === WorkOrderStatus.TRIAGEM)?.avgHours).toBe(3);
  });

  it("descarta intervalos com duração zero (timestamps duplicados)", () => {
    const workOrders = [
      woLc({
        status: WorkOrderStatus.ENCERRADA,
        statusHistory: [
          { toStatus: WorkOrderStatus.ABERTA, changedAt: new Date("2026-01-01T00:00:00Z") },
          { toStatus: WorkOrderStatus.TRIAGEM, changedAt: new Date("2026-01-01T00:00:00Z") }, // mesmo instante: intervalo ABERTA descartado
          { toStatus: WorkOrderStatus.ENCERRADA, changedAt: new Date("2026-01-01T03:00:00Z") }, // TRIAGEM: 3h válido
        ],
      }),
    ];
    const result = calculatePhaseDurations(workOrders, new Date("2026-02-01T00:00:00Z"));
    expect(result.byPhase).toEqual([
      { status: WorkOrderStatus.TRIAGEM, avgHours: 3, sampleCount: 1, openCount: 0 },
    ]);
  });
});

describe("calculateThroughput", () => {
  it("retorna total 0 sem transições para ENCERRADA", () => {
    const workOrders = [
      woLc({
        statusHistory: [{ toStatus: WorkOrderStatus.ABERTA, changedAt: new Date("2026-01-01T00:00:00Z") }],
      }),
    ];
    const result = calculateThroughput(workOrders, null, null);
    expect(result).toEqual({ total: 0, byMonth: [] });
  });

  it("conta OS encerradas agrupando por mês em UTC", () => {
    const workOrders = [
      woLc({
        id: "wo-1",
        statusHistory: [{ toStatus: WorkOrderStatus.ENCERRADA, changedAt: new Date("2026-01-15T00:00:00Z") }],
      }),
      woLc({
        id: "wo-2",
        statusHistory: [{ toStatus: WorkOrderStatus.ENCERRADA, changedAt: new Date("2026-02-10T00:00:00Z") }],
      }),
      woLc({
        id: "wo-3",
        statusHistory: [{ toStatus: WorkOrderStatus.ENCERRADA, changedAt: new Date("2026-02-20T00:00:00Z") }],
      }),
    ];
    const result = calculateThroughput(workOrders, null, null);
    expect(result.total).toBe(3);
    expect(result.byMonth).toEqual([
      { month: "2026-01", count: 1 },
      { month: "2026-02", count: 2 },
    ]);
  });

  it("aplica filtro from/to sobre o changedAt da transição ENCERRADA", () => {
    const workOrders = [
      woLc({
        id: "wo-1",
        statusHistory: [{ toStatus: WorkOrderStatus.ENCERRADA, changedAt: new Date("2026-01-15T00:00:00Z") }],
      }),
      woLc({
        id: "wo-2",
        statusHistory: [{ toStatus: WorkOrderStatus.ENCERRADA, changedAt: new Date("2026-02-10T00:00:00Z") }],
      }),
    ];
    const result = calculateThroughput(
      workOrders,
      new Date("2026-02-01T00:00:00Z"),
      new Date("2026-02-28T23:59:59Z")
    );
    expect(result.total).toBe(1);
    expect(result.byMonth).toEqual([{ month: "2026-02", count: 1 }]);
  });
});

describe("calculateDistribution", () => {
  it("retorna listas vazias sem dados", () => {
    const result = calculateDistribution([]);
    expect(result).toEqual({ byStatus: [], byType: [], byTechnician: [] });
  });

  it("conta byStatus só com chaves presentes, sem emitir zeros", () => {
    const workOrders = [
      woDist({ status: WorkOrderStatus.ABERTA }),
      woDist({ status: WorkOrderStatus.ABERTA }),
      woDist({ status: WorkOrderStatus.EM_EXECUCAO }),
    ];
    const result = calculateDistribution(workOrders);
    expect(result.byStatus).toEqual([
      { status: WorkOrderStatus.ABERTA, count: 2 },
      { status: WorkOrderStatus.EM_EXECUCAO, count: 1 },
    ]);
  });

  it("agrupa byType de forma data-driven, incluindo MELHORIA", () => {
    const workOrders = [
      woDist({ type: WorkOrderType.CORRETIVA }),
      woDist({ type: WorkOrderType.PREVENTIVA }),
      woDist({ type: WorkOrderType.MELHORIA }),
      woDist({ type: WorkOrderType.MELHORIA }),
    ];
    const result = calculateDistribution(workOrders);
    expect(result.byType).toEqual([
      { type: WorkOrderType.CORRETIVA, count: 1 },
      { type: WorkOrderType.PREVENTIVA, count: 1 },
      { type: WorkOrderType.MELHORIA, count: 2 },
    ]);
  });

  it("byTechnician só conta ENCERRADA com assignedToId, ordenando desc com desempate por nome", () => {
    const workOrders = [
      woDist({ status: WorkOrderStatus.ABERTA, assignedToId: "user-1", assignedToName: "Ana" }), // excluída: não encerrada
      woDist({ status: WorkOrderStatus.ENCERRADA, assignedToId: null, assignedToName: null }), // excluída: sem técnico
      woDist({ status: WorkOrderStatus.ENCERRADA, assignedToId: "user-1", assignedToName: "Ana" }),
      woDist({ status: WorkOrderStatus.ENCERRADA, assignedToId: "user-2", assignedToName: "Bruno" }),
      woDist({ status: WorkOrderStatus.ENCERRADA, assignedToId: "user-2", assignedToName: "Bruno" }),
      woDist({ status: WorkOrderStatus.ENCERRADA, assignedToId: "user-3", assignedToName: "Carla" }),
      woDist({ status: WorkOrderStatus.ENCERRADA, assignedToId: "user-4", assignedToName: "Duda" }),
    ];
    const result = calculateDistribution(workOrders);
    expect(result.byTechnician).toEqual([
      { technicianId: "user-2", technicianName: "Bruno", closedCount: 2 },
      { technicianId: "user-1", technicianName: "Ana", closedCount: 1 },
      { technicianId: "user-3", technicianName: "Carla", closedCount: 1 },
      { technicianId: "user-4", technicianName: "Duda", closedCount: 1 },
    ]);
  });
});

describe("executionDurationHours / isAdherent (predicados extraídos)", () => {
  it("executionDurationHours só retorna horas para ENCERRADA com janela de execução completa", () => {
    const closed = wo({
      status: WorkOrderStatus.ENCERRADA,
      executions: [{ startedAt: new Date("2026-01-01T08:00:00Z"), finishedAt: new Date("2026-01-01T10:00:00Z") }],
    });
    expect(executionDurationHours(closed)).toBe(2);

    const stillOpen = wo({
      status: WorkOrderStatus.EM_EXECUCAO,
      executions: [{ startedAt: new Date("2026-01-01T08:00:00Z"), finishedAt: null }],
    });
    expect(executionDurationHours(stillOpen)).toBeNull();

    const closedWithoutExecution = wo({ status: WorkOrderStatus.ENCERRADA, executions: [] });
    expect(executionDurationHours(closedWithoutExecution)).toBeNull();
  });

  it("isAdherent aplica o mesmo critério de calculateAdherence (mesmo dia calendário)", () => {
    const onTime = wo({
      scheduledStart: new Date("2026-01-05T08:00:00Z"),
      executions: [{ startedAt: new Date("2026-01-05T09:30:00Z"), finishedAt: null }],
    });
    expect(isAdherent(onTime)).toBe(true);

    const late = wo({
      scheduledStart: new Date("2026-01-06T08:00:00Z"),
      executions: [{ startedAt: new Date("2026-01-07T08:00:00Z"), finishedAt: null }],
    });
    expect(isAdherent(late)).toBe(false);

    const notScheduled = wo({ scheduledStart: null });
    expect(isAdherent(notScheduled)).toBe(false);
  });
});

describe("calculateTechnicianEfficiency", () => {
  it("retorna [] sem OS", () => {
    expect(calculateTechnicianEfficiency([])).toEqual([]);
  });

  it("agrega closedCount, mttrHours e adherencePercentage por técnico, ordenando desc por closedCount", () => {
    const workOrders = [
      wo({
        assignedToId: "user-1",
        assignedToName: "Ana",
        status: WorkOrderStatus.ENCERRADA,
        scheduledStart: new Date("2026-01-01T08:00:00Z"),
        executions: [{ startedAt: new Date("2026-01-01T08:00:00Z"), finishedAt: new Date("2026-01-01T10:00:00Z") }], // 2h, no prazo
      }),
      wo({
        assignedToId: "user-1",
        assignedToName: "Ana",
        status: WorkOrderStatus.ENCERRADA,
        scheduledStart: new Date("2026-01-02T08:00:00Z"),
        executions: [{ startedAt: new Date("2026-01-02T08:00:00Z"), finishedAt: new Date("2026-01-02T12:00:00Z") }], // 4h, no prazo
      }),
      wo({
        assignedToId: "user-2",
        assignedToName: "Bruno",
        status: WorkOrderStatus.ENCERRADA,
        scheduledStart: new Date("2026-01-03T08:00:00Z"),
        executions: [{ startedAt: new Date("2026-01-04T08:00:00Z"), finishedAt: new Date("2026-01-04T14:00:00Z") }], // 6h, atrasada
      }),
    ];

    const result = calculateTechnicianEfficiency(workOrders);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ technicianId: "user-1", technicianName: "Ana", closedCount: 2 });
    // média manual: (2h + 4h) / 2 = 3h
    expect(result[0].mttrHours).toBe(3);
    expect(result[0].adherencePercentage).toBe(100);

    expect(result[1]).toMatchObject({ technicianId: "user-2", technicianName: "Bruno", closedCount: 1 });
    expect(result[1].mttrHours).toBe(6);
    expect(result[1].adherencePercentage).toBe(0);
  });

  it("conta inProgressCount para status não-terminal e exclui CANCELADA do typeMix", () => {
    const workOrders = [
      wo({ assignedToId: "user-1", assignedToName: "Ana", status: WorkOrderStatus.EM_EXECUCAO, type: WorkOrderType.MELHORIA }),
      wo({ assignedToId: "user-1", assignedToName: "Ana", status: WorkOrderStatus.PROGRAMADA, type: WorkOrderType.PREVENTIVA }),
      wo({ assignedToId: "user-1", assignedToName: "Ana", status: WorkOrderStatus.CANCELADA, type: WorkOrderType.CORRETIVA }),
      wo({ assignedToId: "user-1", assignedToName: "Ana", status: WorkOrderStatus.ENCERRADA, type: WorkOrderType.CORRETIVA }),
    ];

    const result = calculateTechnicianEfficiency(workOrders);
    const ana = result.find((t) => t.technicianId === "user-1")!;

    expect(ana.inProgressCount).toBe(2); // EM_EXECUCAO + PROGRAMADA
    expect(ana.closedCount).toBe(1);
    expect(ana.typeMix).toHaveLength(3); // CANCELADA excluída do mix
    expect(ana.typeMix).toEqual(
      expect.arrayContaining([
        { type: WorkOrderType.MELHORIA, count: 1 },
        { type: WorkOrderType.PREVENTIVA, count: 1 },
        { type: WorkOrderType.CORRETIVA, count: 1 }, // só a ENCERRADA; a CANCELADA do mesmo type fica de fora
      ])
    );
  });

  it("técnico sem OS encerrada mas com OS em andamento: mttr/adherence null, inProgressCount > 0", () => {
    const workOrders = [
      wo({ assignedToId: "user-3", assignedToName: "Carla", status: WorkOrderStatus.EM_EXECUCAO, executions: [] }),
    ];
    const result = calculateTechnicianEfficiency(workOrders);
    expect(result).toEqual([
      {
        technicianId: "user-3",
        technicianName: "Carla",
        closedCount: 0,
        inProgressCount: 1,
        mttrHours: null,
        adherencePercentage: null,
        typeMix: [{ type: WorkOrderType.CORRETIVA, count: 1 }],
        mttrAsPrincipalHours: null,
        mttrAsApoioHours: null,
        asPrincipalCount: 0,
        asApoioCount: 0,
      },
    ]);
  });

  it("ignora OS sem assignedToId", () => {
    const workOrders = [wo({ assignedToId: null, status: WorkOrderStatus.ENCERRADA })];
    expect(calculateTechnicianEfficiency(workOrders)).toEqual([]);
  });
});

describe("calculateTrend", () => {
  it("retorna deltaPercent null quando previousCount é 0", () => {
    const result = calculateTrend(5, 0);
    expect(result).toEqual({ currentCount: 5, previousCount: 0, deltaPercent: null });
  });

  it("calcula aumento percentual (12 vs 10 = +20%)", () => {
    const result = calculateTrend(12, 10);
    expect(result).toEqual({ currentCount: 12, previousCount: 10, deltaPercent: 20 });
  });

  it("calcula queda percentual (8 vs 10 = -20%)", () => {
    const result = calculateTrend(8, 10);
    expect(result).toEqual({ currentCount: 8, previousCount: 10, deltaPercent: -20 });
  });
});
