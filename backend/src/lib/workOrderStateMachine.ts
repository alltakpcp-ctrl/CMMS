import { Role, WorkOrderStatus } from "../domain/enums";

export type TransitionErrorCode =
  | "ROLE_FORBIDDEN"
  | "NOT_ASSIGNED"
  | "INVALID_TRANSITION"
  | "MISSING_CONTEXT"
  | "NOTE_REQUIRED"
  | "PRIORITY_NOT_URGENT";

export interface CanTransitionResult {
  ok: boolean;
  reason?: string;
  code?: TransitionErrorCode;
}

export interface TransitionContext {
  userId: string;
  role?: Role;
  assignedToId?: string | null;
  assigneeIds?: string[];
  note?: string | null;
  hasScheduledStart?: boolean;
  hasScheduledEnd?: boolean;
  hasAssignedTechnician?: boolean;
  priority?: string | null;
}

interface TransitionRule {
  from: WorkOrderStatus;
  to: WorkOrderStatus;
  roles: Role[];
  requireAssignedTechnician?: boolean;
  requireNote?: boolean;
  requiredContextFlags?: Array<keyof TransitionContext>;
  guard?: (context: TransitionContext) => boolean;
  guardErrorCode?: TransitionErrorCode;
  guardErrorMessage?: string;
}

// Tabela de transições — §6 do CLAUDE.md.
const TRANSITIONS: TransitionRule[] = [
  { from: WorkOrderStatus.ABERTA, to: WorkOrderStatus.TRIAGEM, roles: [Role.TECNICO, Role.SUPERVISOR] },
  { from: WorkOrderStatus.TRIAGEM, to: WorkOrderStatus.PLANEJADA, roles: [Role.TECNICO, Role.SUPERVISOR] },
  {
    from: WorkOrderStatus.PLANEJADA,
    to: WorkOrderStatus.PROGRAMADA,
    roles: [Role.SUPERVISOR],
    requiredContextFlags: ["hasScheduledStart", "hasScheduledEnd", "hasAssignedTechnician"],
  },
  {
    from: WorkOrderStatus.PROGRAMADA,
    to: WorkOrderStatus.EM_EXECUCAO,
    roles: [Role.TECNICO],
    requireAssignedTechnician: true,
  },
  // O próprio técnico pode iniciar direto da triagem, em qualquer prioridade,
  // sem passar pela programação do supervisor.
  {
    from: WorkOrderStatus.TRIAGEM,
    to: WorkOrderStatus.EM_EXECUCAO,
    roles: [Role.TECNICO],
  },
  // Mesma lógica, mas quando o planejamento já foi feito antes de o técnico
  // iniciar — pula a programação do supervisor.
  {
    from: WorkOrderStatus.PLANEJADA,
    to: WorkOrderStatus.EM_EXECUCAO,
    roles: [Role.TECNICO],
  },
  {
    from: WorkOrderStatus.EM_EXECUCAO,
    to: WorkOrderStatus.AGUARDANDO_VALIDACAO,
    roles: [Role.TECNICO],
    requireAssignedTechnician: true,
  },
  { from: WorkOrderStatus.AGUARDANDO_VALIDACAO, to: WorkOrderStatus.ENCERRADA, roles: [Role.SUPERVISOR] },
  {
    from: WorkOrderStatus.AGUARDANDO_VALIDACAO,
    to: WorkOrderStatus.EM_EXECUCAO,
    roles: [Role.SUPERVISOR],
    requireNote: true,
  },
];

const CONTEXT_FIELD_LABELS: Partial<Record<keyof TransitionContext, string>> = {
  hasScheduledStart: "scheduledStart",
  hasScheduledEnd: "scheduledEnd",
  hasAssignedTechnician: "assignedToId",
};

export function canTransition(params: {
  from: WorkOrderStatus;
  to: WorkOrderStatus;
  role: Role;
  context: TransitionContext;
}): CanTransitionResult {
  const { from, to, role, context } = params;

  if (to === WorkOrderStatus.CANCELADA) {
    if (from === WorkOrderStatus.ENCERRADA || from === WorkOrderStatus.CANCELADA) {
      return {
        ok: false,
        code: "INVALID_TRANSITION",
        reason: `Não é possível cancelar uma OS em status ${from}.`,
      };
    }
    if (role !== Role.SUPERVISOR) {
      return { ok: false, code: "ROLE_FORBIDDEN", reason: "Apenas SUPERVISOR pode cancelar uma OS." };
    }
    if (!context.note) {
      return { ok: false, code: "NOTE_REQUIRED", reason: "Nota é obrigatória para cancelar uma OS." };
    }
    return { ok: true };
  }

  const rule = TRANSITIONS.find((t) => t.from === from && t.to === to);
  if (!rule) {
    return {
      ok: false,
      code: "INVALID_TRANSITION",
      reason: `Transição de ${from} para ${to} não é permitida.`,
    };
  }

  if (!rule.roles.includes(role)) {
    return { ok: false, code: "ROLE_FORBIDDEN", reason: `Perfil ${role} não pode executar esta transição.` };
  }

  if (rule.guard && !rule.guard(context)) {
    return {
      ok: false,
      code: rule.guardErrorCode ?? "INVALID_TRANSITION",
      reason: rule.guardErrorMessage ?? `Transição de ${from} para ${to} não é permitida.`,
    };
  }

  if (
    rule.requireAssignedTechnician &&
    context.role === Role.TECNICO &&
    context.userId !== context.assignedToId &&
    !(context.assigneeIds ?? []).includes(context.userId)
  ) {
    return {
      ok: false,
      code: "NOT_ASSIGNED",
      reason: "Somente o técnico responsável pela OS pode executar esta ação.",
    };
  }

  if (rule.requireNote && !context.note) {
    return { ok: false, code: "NOTE_REQUIRED", reason: "Nota é obrigatória para esta transição." };
  }

  if (rule.requiredContextFlags) {
    for (const flag of rule.requiredContextFlags) {
      if (!context[flag]) {
        return {
          ok: false,
          code: "MISSING_CONTEXT",
          reason: `Campo obrigatório ausente: ${CONTEXT_FIELD_LABELS[flag] ?? flag}.`,
        };
      }
    }
  }

  return { ok: true };
}
