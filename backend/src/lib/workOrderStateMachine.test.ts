import { describe, expect, it } from "vitest";
import { canTransition } from "./workOrderStateMachine";
import { Role, WorkOrderStatus } from "../domain/enums";

const baseContext = { userId: "user-1" };

describe("workOrderStateMachine", () => {
  it("permite ABERTA -> TRIAGEM para TECNICO", () => {
    const result = canTransition({
      from: WorkOrderStatus.ABERTA,
      to: WorkOrderStatus.TRIAGEM,
      role: Role.TECNICO,
      context: baseContext,
    });
    expect(result.ok).toBe(true);
  });

  it("bloqueia ABERTA -> TRIAGEM para OPERADOR", () => {
    const result = canTransition({
      from: WorkOrderStatus.ABERTA,
      to: WorkOrderStatus.TRIAGEM,
      role: Role.OPERADOR,
      context: baseContext,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("ROLE_FORBIDDEN");
  });

  it("bloqueia PLANEJADA -> PROGRAMADA sem scheduledStart/End/assignedTo", () => {
    const result = canTransition({
      from: WorkOrderStatus.PLANEJADA,
      to: WorkOrderStatus.PROGRAMADA,
      role: Role.SUPERVISOR,
      context: baseContext,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("MISSING_CONTEXT");
  });

  it("permite PLANEJADA -> PROGRAMADA com contexto completo", () => {
    const result = canTransition({
      from: WorkOrderStatus.PLANEJADA,
      to: WorkOrderStatus.PROGRAMADA,
      role: Role.SUPERVISOR,
      context: { ...baseContext, hasScheduledStart: true, hasScheduledEnd: true, hasAssignedTechnician: true },
    });
    expect(result.ok).toBe(true);
  });

  it("bloqueia PROGRAMADA -> EM_EXECUCAO se o técnico não for o assignedTo", () => {
    const result = canTransition({
      from: WorkOrderStatus.PROGRAMADA,
      to: WorkOrderStatus.EM_EXECUCAO,
      role: Role.TECNICO,
      context: { userId: "user-1", assignedToId: "user-2" },
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("NOT_ASSIGNED");
  });

  it("permite PROGRAMADA -> EM_EXECUCAO quando o técnico é o assignedTo", () => {
    const result = canTransition({
      from: WorkOrderStatus.PROGRAMADA,
      to: WorkOrderStatus.EM_EXECUCAO,
      role: Role.TECNICO,
      context: { userId: "user-1", assignedToId: "user-1" },
    });
    expect(result.ok).toBe(true);
  });

  it("bloqueia reprovação (AGUARDANDO_VALIDACAO -> EM_EXECUCAO) sem nota", () => {
    const result = canTransition({
      from: WorkOrderStatus.AGUARDANDO_VALIDACAO,
      to: WorkOrderStatus.EM_EXECUCAO,
      role: Role.SUPERVISOR,
      context: baseContext,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("NOTE_REQUIRED");
  });

  it("permite aprovação AGUARDANDO_VALIDACAO -> ENCERRADA para SUPERVISOR", () => {
    const result = canTransition({
      from: WorkOrderStatus.AGUARDANDO_VALIDACAO,
      to: WorkOrderStatus.ENCERRADA,
      role: Role.SUPERVISOR,
      context: baseContext,
    });
    expect(result.ok).toBe(true);
  });

  it("permite cancelar de qualquer status (exceto ENCERRADA/CANCELADA) com nota, só SUPERVISOR", () => {
    const result = canTransition({
      from: WorkOrderStatus.EM_EXECUCAO,
      to: WorkOrderStatus.CANCELADA,
      role: Role.SUPERVISOR,
      context: { ...baseContext, note: "Ativo desativado." },
    });
    expect(result.ok).toBe(true);
  });

  it("bloqueia cancelar uma OS já ENCERRADA", () => {
    const result = canTransition({
      from: WorkOrderStatus.ENCERRADA,
      to: WorkOrderStatus.CANCELADA,
      role: Role.SUPERVISOR,
      context: { ...baseContext, note: "Tentativa inválida." },
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INVALID_TRANSITION");
  });

  it("bloqueia transições fora da tabela (pular etapas)", () => {
    const result = canTransition({
      from: WorkOrderStatus.ABERTA,
      to: WorkOrderStatus.PROGRAMADA,
      role: Role.SUPERVISOR,
      context: baseContext,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INVALID_TRANSITION");
  });
});
