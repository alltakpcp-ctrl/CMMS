import { describe, expect, it } from "vitest";
import { RECONSTRUCTION_TAG, ReconstructionWorkOrder, reconstructStatusHistory } from "./statusHistoryReconstruction";

const FALLBACK = "admin";
const t = (iso: string) => new Date(iso);

function wo(overrides: Partial<ReconstructionWorkOrder>): ReconstructionWorkOrder {
  return {
    id: "wo-1",
    status: "ENCERRADA",
    createdAt: t("2026-09-01T10:00:00Z"),
    updatedAt: t("2026-09-03T17:00:00Z"),
    requesterId: "operador",
    targetSectorId: "setor",
    plan: "Plano",
    scheduledStart: t("2026-09-02T08:00:00Z"),
    maintenancePlanId: null,
    excludedAt: null,
    excludedById: null,
    exclusionReason: null,
    ...overrides,
  };
}

const chain = (entries: { fromStatus: string | null; toStatus: string }[]) =>
  entries.map((e) => `${e.fromStatus ?? "∅"}>${e.toStatus}`).join(" ");

function assertContinuous(entries: { fromStatus: string | null; toStatus: string; changedAt: Date }[]) {
  for (let i = 1; i < entries.length; i++) {
    expect(entries[i].fromStatus).toBe(entries[i - 1].toStatus);
    expect(entries[i].changedAt.getTime()).toBeGreaterThan(entries[i - 1].changedAt.getTime());
  }
}

describe("reconstructStatusHistory", () => {
  it("OS sem nenhum histórico: monta o fluxo completo com datas das execuções", () => {
    const result = reconstructStatusHistory(
      wo({}),
      [],
      [{ startedAt: t("2026-09-02T08:10:00Z"), finishedAt: t("2026-09-02T11:00:00Z"), startedById: "tec", endedById: "tec" }],
      FALLBACK
    );

    expect(chain(result)).toBe(
      "∅>ABERTA ABERTA>TRIAGEM TRIAGEM>PLANEJADA PLANEJADA>PROGRAMADA PROGRAMADA>EM_EXECUCAO EM_EXECUCAO>AGUARDANDO_VALIDACAO AGUARDANDO_VALIDACAO>ENCERRADA"
    );
    assertContinuous(result);
    expect(result[0]).toMatchObject({ changedAt: t("2026-09-01T10:00:00Z"), changedById: "operador" });
    expect(result[4]).toMatchObject({ changedAt: t("2026-09-02T08:10:00Z"), changedById: "tec" });
    expect(result[5]).toMatchObject({ changedAt: t("2026-09-02T11:00:00Z"), changedById: "tec" });
    expect(result[6]).toMatchObject({ changedAt: t("2026-09-03T17:00:00Z"), changedById: FALLBACK });
    expect(result.every((e) => e.note.startsWith(RECONSTRUCTION_TAG))).toBe(true);
    // Etapas interpoladas ficam entre a abertura e o início da execução.
    expect(result[1].changedAt > result[0].changedAt && result[3].changedAt < result[4].changedAt).toBe(true);
  });

  it("início direto da triagem (sem plano/programação) pula PLANEJADA e PROGRAMADA", () => {
    const result = reconstructStatusHistory(
      wo({ plan: null, scheduledStart: null }),
      [],
      [{ startedAt: t("2026-09-01T11:00:00Z"), finishedAt: t("2026-09-01T12:00:00Z"), startedById: "tec", endedById: "tec" }],
      FALLBACK
    );
    expect(chain(result)).toBe(
      "∅>ABERTA ABERTA>TRIAGEM TRIAGEM>EM_EXECUCAO EM_EXECUCAO>AGUARDANDO_VALIDACAO AGUARDANDO_VALIDACAO>ENCERRADA"
    );
  });

  it("preenche só o buraco entre o histórico restaurado (até 18/08) e o pós-incidente", () => {
    const history = [
      { fromStatus: null, toStatus: "ABERTA", changedAt: t("2026-08-10T10:00:00Z"), note: null },
      { fromStatus: "ABERTA", toStatus: "TRIAGEM", changedAt: t("2026-08-10T11:00:00Z"), note: null },
      { fromStatus: "TRIAGEM", toStatus: "PLANEJADA", changedAt: t("2026-08-11T09:00:00Z"), note: null },
      // buraco: PLANEJADA → … → EM_EXECUCAO
      { fromStatus: "EM_EXECUCAO", toStatus: "AGUARDANDO_VALIDACAO", changedAt: t("2026-09-20T10:00:00Z"), note: null },
    ];
    const result = reconstructStatusHistory(
      wo({ status: "AGUARDANDO_VALIDACAO", createdAt: t("2026-08-10T10:00:00Z") }),
      history,
      [{ startedAt: t("2026-09-05T08:00:00Z"), finishedAt: t("2026-09-20T10:00:00Z"), startedById: "tec", endedById: "tec" }],
      FALLBACK
    );
    expect(chain(result)).toBe("PLANEJADA>PROGRAMADA PROGRAMADA>EM_EXECUCAO");
    expect(result[1]).toMatchObject({ changedAt: t("2026-09-05T08:00:00Z"), changedById: "tec" });
  });

  it("reprovação na validação: dois ciclos de execução viram dois EM_EXECUCAO", () => {
    const result = reconstructStatusHistory(
      wo({ plan: null, scheduledStart: null }),
      [],
      [
        { startedAt: t("2026-09-01T11:00:00Z"), finishedAt: t("2026-09-01T12:00:00Z"), startedById: "tec", endedById: "tec" },
        { startedAt: t("2026-09-02T09:00:00Z"), finishedAt: t("2026-09-02T10:00:00Z"), startedById: "sup", endedById: "tec" },
      ],
      FALLBACK
    );
    expect(chain(result)).toBe(
      "∅>ABERTA ABERTA>TRIAGEM TRIAGEM>EM_EXECUCAO EM_EXECUCAO>AGUARDANDO_VALIDACAO AGUARDANDO_VALIDACAO>EM_EXECUCAO EM_EXECUCAO>AGUARDANDO_VALIDACAO AGUARDANDO_VALIDACAO>ENCERRADA"
    );
    assertContinuous(result);
  });

  it("OS gerada pelo plano de preventiva nasce ABERTA→PROGRAMADA no mesmo instante", () => {
    const result = reconstructStatusHistory(
      wo({ status: "PROGRAMADA", plan: null, targetSectorId: null, maintenancePlanId: "plano" }),
      [],
      [],
      FALLBACK
    );
    expect(chain(result)).toBe("∅>ABERTA ABERTA>PROGRAMADA");
    expect(result[1].changedById).toBe("operador");
  });

  it("cancelada depois de iniciar: avança até a execução e cancela na última atualização", () => {
    const result = reconstructStatusHistory(
      wo({ status: "CANCELADA", plan: null, scheduledStart: null }),
      [],
      [{ startedAt: t("2026-09-01T11:00:00Z"), finishedAt: t("2026-09-03T17:00:00Z"), startedById: "tec", endedById: null }],
      FALLBACK
    );
    expect(chain(result)).toBe("∅>ABERTA ABERTA>TRIAGEM TRIAGEM>EM_EXECUCAO EM_EXECUCAO>CANCELADA");
  });

  it("OS com cadeia íntegra não gera nada", () => {
    const history = [
      { fromStatus: null, toStatus: "ABERTA", changedAt: t("2026-09-20T10:00:00Z"), note: null },
      { fromStatus: "ABERTA", toStatus: "TRIAGEM", changedAt: t("2026-09-20T11:00:00Z"), note: null },
    ];
    expect(reconstructStatusHistory(wo({ status: "TRIAGEM" }), history, [], FALLBACK)).toEqual([]);
  });

  it("status atual anterior ao último registrado (override perdido) vira transição direta", () => {
    const history = [
      { fromStatus: null, toStatus: "ABERTA", changedAt: t("2026-08-10T10:00:00Z"), note: null },
      { fromStatus: "ABERTA", toStatus: "TRIAGEM", changedAt: t("2026-08-10T11:00:00Z"), note: null },
      { fromStatus: "TRIAGEM", toStatus: "PLANEJADA", changedAt: t("2026-08-11T11:00:00Z"), note: null },
    ];
    const result = reconstructStatusHistory(wo({ status: "TRIAGEM" }), history, [], FALLBACK);
    expect(chain(result)).toBe("PLANEJADA>TRIAGEM");
    expect(result[0].note).toContain("override");
  });
});
