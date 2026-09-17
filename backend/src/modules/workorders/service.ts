import { Prisma, WorkOrder } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../lib/AppError";
import { publicUserSelect } from "../../lib/publicUser";
import { generateWorkOrderNumber } from "../../lib/workOrderNumber";
import { canTransition, TransitionContext } from "../../lib/workOrderStateMachine";
import { assertActiveSector } from "../../lib/sectors";
import { resolveAssigneeIds } from "../../lib/assignees";
import { workOrderInclude } from "../../lib/workOrderInclude";
import { calculateNextDueDate } from "../../lib/maintenancePlans";
import { generateWorkOrderFromPlan } from "../../lib/generateWorkOrderFromPlan";
import { createWithdrawalRequest } from "../stock-withdrawals/service";
import { AuthPayload } from "../../middlewares/authenticate";
import { MaintenancePeriodicity, Role, WorkOrderStatus, WorkOrderType } from "../../domain/enums";
import {
  CancelarInput,
  CreateWorkOrderInput,
  EncerramentoTecnicoInput,
  ExcluirInput,
  IniciarInput,
  ListBauQuery,
  ListWorkOrdersQuery,
  PlanejamentoInput,
  ProgramacaoInput,
  RegistrarInput,
  ReprogramacaoInput,
  TimelineOverrideInput,
  TriagemInput,
  ValidarInput,
} from "./schema";

// Reexportado por compatibilidade — o include em si mora em
// lib/workOrderInclude.ts (compartilhado com lib/generateWorkOrderFromPlan.ts
// sem criar dependência circular entre workorders/service.ts e
// maintenance-plans/service.ts).
export { workOrderInclude };

export async function createWorkOrder(input: CreateWorkOrderInput, user: AuthPayload) {
  const asset = await prisma.asset.findUnique({ where: { id: input.assetId } });
  if (!asset) {
    throw new AppError(404, "ASSET_NOT_FOUND", "Ativo não encontrado.");
  }
  // Operador só abre OS para ativos vinculados ao seu setor (AssetSector N:N).
  // SUPERVISOR não tem essa restrição.
  if (user.role === Role.OPERADOR) {
    const operador = await prisma.user.findUnique({ where: { id: user.userId }, select: { sectorId: true } });
    if (!operador?.sectorId) {
      throw new AppError(403, "OPERATOR_WITHOUT_SECTOR", "Operador sem setor não pode abrir solicitação.");
    }
    const vinculo = await prisma.assetSector.findFirst({
      where: { assetId: asset.id, sectorId: operador.sectorId },
      select: { assetId: true },
    });
    if (!vinculo) {
      throw new AppError(403, "ASSET_OUT_OF_SECTOR", "Ativo fora do setor do operador.");
    }
  }

  return prisma.$transaction(async (tx) => {
    const number = await generateWorkOrderNumber(tx);

    // Vínculo reverso Agenda ⇄ OS: toda OS PREVENTIVA fica associada a um
    // MaintenancePlan, mesmo quando aberta direto (não pela Agenda). Se já
    // existe um plano ativo para o ativo+disciplina, vincula a ele; senão,
    // cria um plano "rascunho" (sem periodicidade — o supervisor completa
    // depois na Agenda) só para a OS aparecer no calendário de preventivas.
    let maintenancePlanId: string | undefined;
    if (input.type === WorkOrderType.PREVENTIVA) {
      const existingPlan = await tx.maintenancePlan.findFirst({
        where: { assetId: input.assetId, discipline: input.disciplina, active: true },
        select: { id: true },
      });
      maintenancePlanId = existingPlan
        ? existingPlan.id
        : (
            await tx.maintenancePlan.create({
              data: {
                assetId: input.assetId,
                discipline: input.disciplina,
                title: input.title,
                description: input.description,
                priority: input.priority,
                periodicity: null,
              },
              select: { id: true },
            })
          ).id;
    }

    const workOrder = await tx.workOrder.create({
      data: {
        number,
        type: input.type,
        disciplina: input.disciplina,
        priority: input.priority,
        title: input.title,
        description: input.description,
        assetId: input.assetId,
        requesterId: user.userId,
        status: WorkOrderStatus.ABERTA,
        maintenancePlanId,
      },
      select: { id: true },
    });

    await tx.statusHistory.create({
      data: {
        workOrderId: workOrder.id,
        fromStatus: null,
        toStatus: WorkOrderStatus.ABERTA,
        changedById: user.userId,
      },
    });

    const created = await tx.workOrder.findUniqueOrThrow({
      where: { id: workOrder.id },
      include: workOrderInclude,
    });
    return created;
  });
}

// Fase 3.A: OPERADOR só enxerga OS de ativos do seu próprio setor
// (asset.sectorId, não targetSectorId — este último fica null até a triagem).
// TECNICO e SUPERVISOR são isentos e veem todos os setores. Sem sectorId
// cadastrado, o operador não vê nada (fail-closed), nunca erro.
async function operadorSectorFilter(user: AuthPayload): Promise<{ blocked: true } | { blocked: false; sectorId: string | null }> {
  if (user.role !== Role.OPERADOR) {
    return { blocked: false, sectorId: null };
  }
  const operador = await prisma.user.findUnique({ where: { id: user.userId }, select: { sectorId: true } });
  if (!operador?.sectorId) {
    return { blocked: true };
  }
  return { blocked: false, sectorId: operador.sectorId };
}

export async function listWorkOrders(filters: ListWorkOrdersQuery, user: AuthPayload) {
  const { page = 1, pageSize = 20, ...rest } = filters;

  const sectorFilter = await operadorSectorFilter(user);
  if (sectorFilter.blocked) {
    return { items: [], total: 0, page, pageSize };
  }

  // Operador não pode filtrar por targetSectorId via query manual — o setor
  // dele já é aplicado abaixo via asset.sectorId (sectorFilter.sectorId).
  const targetSectorId = user.role === Role.OPERADOR ? undefined : rest.targetSectorId;

  const where: Prisma.WorkOrderWhereInput = {
    // Fase 4 do "baú" (CLAUDE.md §5.2): por padrão some da listagem qualquer
    // OS excluída — só quem passa incluirExcluidas=true (o Baú, Fase 5) vê.
    ...(!rest.incluirExcluidas && { excludedAt: null }),
    ...(rest.status && { status: rest.status }),
    ...(rest.type && { type: rest.type }),
    ...(targetSectorId && { targetSectorId }),
    ...(rest.assetId && { assetId: rest.assetId }),
    ...(rest.assignedToId && { assignedToId: rest.assignedToId }),
    ...(rest.requesterId && { requesterId: rest.requesterId }),
    ...(rest.asSupport && { assignees: { some: { userId: user.userId } } }),
    ...(sectorFilter.sectorId && { asset: { sectorId: sectorFilter.sectorId } }),
  };

  const [items, total] = await Promise.all([
    prisma.workOrder.findMany({
      where,
      include: workOrderInclude,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.workOrder.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

// Baú (Fase 5, §5.2 do CLAUDE.md): OS CANCELADA + OS excluída, cada uma com
// motivo/quem/quando. SUPERVISOR-only (autorização na própria rota) — sem
// filtro de setor, mesma isenção que SUPERVISOR já tem em todo o sistema.
// Os dois mecanismos de auditoria são diferentes por baixo (excludedAt/
// excludedById/exclusionReason direto na OS vs. a StatusHistory da
// transição ABERTA/qualquer→CANCELADA) — normalizados aqui num único
// `bauInfo` pra Fase 7 (tela) não precisar conhecer essa diferença.
export async function listBau(query: ListBauQuery) {
  const { page = 1, pageSize = 20 } = query;

  const where: Prisma.WorkOrderWhereInput = {
    OR: [{ status: WorkOrderStatus.CANCELADA }, { excludedAt: { not: null } }],
  };

  const [items, total] = await Promise.all([
    prisma.workOrder.findMany({
      where,
      include: {
        ...workOrderInclude,
        excludedBy: { select: publicUserSelect },
        // Só a transição mais recente para CANCELADA — suficiente pra
        // motivo/quem/quando; histórico completo já é visível em GET /:id.
        statusHistory: {
          where: { toStatus: WorkOrderStatus.CANCELADA },
          orderBy: { changedAt: "desc" },
          take: 1,
          include: { changedBy: { select: publicUserSelect } },
        },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.workOrder.count({ where }),
  ]);

  const withBauInfo = items.map((wo) => {
    const bauInfo = wo.excludedAt
      ? { kind: "EXCLUIDA" as const, reason: wo.exclusionReason, by: wo.excludedBy, at: wo.excludedAt }
      : {
          kind: "CANCELADA" as const,
          reason: wo.statusHistory[0]?.note ?? null,
          by: wo.statusHistory[0]?.changedBy ?? null,
          at: wo.statusHistory[0]?.changedAt ?? wo.updatedAt,
        };
    return { ...wo, bauInfo };
  });

  return { items: withBauInfo, total, page, pageSize };
}

export async function getWorkOrderById(id: string, user: AuthPayload) {
  const workOrder = await prisma.workOrder.findUnique({
    where: { id },
    include: {
      ...workOrderInclude,
      statusHistory: {
        orderBy: { changedAt: "asc" },
        include: { changedBy: { select: publicUserSelect } },
      },
    },
  });

  if (!workOrder) {
    throw new AppError(404, "WORK_ORDER_NOT_FOUND", "Ordem de serviço não encontrada.");
  }

  const sectorFilter = await operadorSectorFilter(user);
  if (sectorFilter.blocked) {
    throw new AppError(404, "WORK_ORDER_NOT_FOUND", "Ordem de serviço não encontrada.");
  }
  // 404 (não 403): não revela a operador a existência de OS de outro setor.
  if (sectorFilter.sectorId && sectorFilter.sectorId !== workOrder.asset.sectorId) {
    throw new AppError(404, "WORK_ORDER_NOT_FOUND", "Ordem de serviço não encontrada.");
  }

  return workOrder;
}

async function assertNoOpenSubtasks(tx: Prisma.TransactionClient, workOrderId: string) {
  const openSubtasks = await tx.subtask.findMany({
    where: { workOrderId, status: "ABERTA" },
    select: { id: true, title: true },
  });
  if (openSubtasks.length > 0) {
    const titles = openSubtasks.map((s) => s.title).join(", ");
    throw new AppError(
      422,
      "HAS_OPEN_SUBTASKS",
      `Não é possível encerrar a OS. Existem ${openSubtasks.length} subtarefa(s) em aberto: ${titles}. Conclua ou cancele todas antes de encerrar.`
    );
  }
}

interface ApplyTransitionParams {
  id: string;
  to: WorkOrderStatus;
  role: Role;
  userId: string;
  note?: string | null;
  context?: Partial<TransitionContext>;
  mutate?: (tx: Prisma.TransactionClient, workOrder: WorkOrder) => Promise<Prisma.WorkOrderUpdateInput | void>;
}

async function applyTransition({ id, to, role, userId, note, context, mutate }: ApplyTransitionParams) {
  return prisma.$transaction(async (tx) => {
    const workOrder = await tx.workOrder.findUnique({
      where: { id },
      include: {
        assignees: { select: { userId: true } },
      },
    });
    if (!workOrder) {
      throw new AppError(404, "WORK_ORDER_NOT_FOUND", "Ordem de serviço não encontrada.");
    }
    // Uma OS excluída fica congelada (§5.2 do CLAUDE.md) — mesmo guard em
    // timelineOverride()/reprogramacao(), que passam ao largo desta função.
    if (workOrder.excludedAt) {
      throw new AppError(409, "ALREADY_EXCLUDED", "Esta OS foi excluída e não pode mais ser alterada.");
    }

    const result = canTransition({
      from: workOrder.status as WorkOrderStatus,
      to,
      role,
      context: {
        userId,
        role,
        assignedToId: workOrder.assignedToId,
        assigneeIds: workOrder.assignees.map((a) => a.userId),
        note,
        priority: workOrder.priority,
        type: workOrder.type as WorkOrderType,
        ...context,
      },
    });

    if (!result.ok) {
      const status = result.code === "ROLE_FORBIDDEN" || result.code === "NOT_ASSIGNED" ? 403 : 409;
      throw new AppError(status, result.code ?? "INVALID_TRANSITION", result.reason ?? "Transição inválida.");
    }

    // Bloqueia tanto o encerramento técnico (→AGUARDANDO_VALIDACAO) quanto a
    // validação do supervisor (→ENCERRADA) — defesa em profundidade caso uma
    // subtask seja reaberta enquanto a OS já está aguardando validação.
    if (to === WorkOrderStatus.AGUARDANDO_VALIDACAO || to === WorkOrderStatus.ENCERRADA) {
      await assertNoOpenSubtasks(tx, id);
    }

    const extraData = (await mutate?.(tx, workOrder)) ?? {};

    const updated = await tx.workOrder.update({
      where: { id },
      data: { ...extraData, status: to },
      include: workOrderInclude,
    });

    await tx.statusHistory.create({
      data: {
        workOrderId: id,
        fromStatus: workOrder.status,
        toStatus: to,
        changedById: userId,
        note: note ?? null,
      },
    });

    // GANCHO FUTURO (§5.6): ponto natural para disparar notificações (e-mail,
    // push, etc.) — ex.: avisar o assignedTo ao ser designado (PROGRAMADA),
    // ou o requester ao ser ENCERRADA. Disparar fora da transação (após o
    // commit) para não acoplar a confiabilidade da notificação à da escrita.
    // NÃO implementado no MVP.

    return updated;
  });
}

export function triagem(id: string, input: TriagemInput, user: AuthPayload) {
  return applyTransition({
    id,
    to: WorkOrderStatus.TRIAGEM,
    role: user.role,
    userId: user.userId,
    mutate: async (tx, workOrder) => {
      await assertActiveSector(tx, input.targetSectorId);

      // Indicador de periodicidade: TECNICO/SUPERVISOR podem definir (ou
      // atualizar) já na triagem a periodicidade do MaintenancePlan vinculado
      // — mesmo plano criado como "rascunho" em createWorkOrder() quando a OS
      // PREVENTIVA foi aberta sem um plano ativo prévio para o ativo. Isso
      // habilita a geração automática do próximo ciclo (autoGenerateNextPreventiveCycle)
      // quando esta OS for encerrada.
      if (input.periodicity) {
        if (workOrder.type !== WorkOrderType.PREVENTIVA) {
          throw new AppError(422, "PERIODICITY_NOT_APPLICABLE", "Periodicidade só se aplica a OS preventiva.");
        }
        await tx.maintenancePlan.update({
          where: { id: workOrder.maintenancePlanId! },
          data: { periodicity: input.periodicity },
        });
      }

      if (input.priority === workOrder.priority) {
        return {
          priority: input.priority,
          targetSectorId: input.targetSectorId,
          trabalhoEmAltura: input.trabalhoEmAltura,
        };
      }

      return {
        priority: input.priority,
        targetSectorId: input.targetSectorId,
        trabalhoEmAltura: input.trabalhoEmAltura,
        priorityAdjustedByTech: true,
        priorityOriginal: workOrder.priority,
        priorityAdjustedById: user.userId,
        priorityAdjustedAt: new Date(),
      };
    },
  });
}

export function planejamento(id: string, input: PlanejamentoInput, user: AuthPayload) {
  return applyTransition({
    id,
    to: WorkOrderStatus.PLANEJADA,
    role: user.role,
    userId: user.userId,
    mutate: async (tx, workOrder) => {
      const plannedParts = input.plannedParts ?? [];

      if (plannedParts.length > 0) {
        const found = await tx.part.findMany({
          where: { id: { in: plannedParts.map((p) => p.partId) } },
          select: { id: true },
        });
        const foundIds = new Set(found.map((p) => p.id));
        const missing = plannedParts.filter((p) => !foundIds.has(p.partId));
        if (missing.length > 0) {
          throw new AppError(
            400,
            "PART_NOT_FOUND",
            `Peça(s) não encontrada(s): ${missing.map((p) => p.partId).join(", ")}.`
          );
        }
      }

      // O responsável (atual assignedTo, se já houver, e o próprio usuário
      // logado) nunca entra como manutentor de apoio.
      const assigneeIds = await resolveAssigneeIds(tx, input.assigneeIds ?? [], {
        rejectIds: [user.userId, workOrder.assignedToId],
      });

      return {
        plan: input.plan,
        estimatedHours: input.estimatedHours,
        tools: input.tools,
        ppe: input.ppe,
        plannedPartItems: {
          create: plannedParts.map((p) => ({ partId: p.partId, quantity: p.quantity })),
        },
        assignees: {
          deleteMany: {},
          create: assigneeIds.map((assigneeId) => ({ userId: assigneeId })),
        },
        numMaintainers: 1 + assigneeIds.length,
      };
    },
  });
}

export function programacao(id: string, input: ProgramacaoInput, user: AuthPayload) {
  return applyTransition({
    id,
    to: WorkOrderStatus.PROGRAMADA,
    role: user.role,
    userId: user.userId,
    context: {
      hasScheduledStart: Boolean(input.scheduledStart),
      hasScheduledEnd: Boolean(input.scheduledEnd),
      hasAssignedTechnician: Boolean(input.assigneeIds?.length),
      hasEstimatedHours: Boolean(input.estimatedHours),
    },
    mutate: async (tx) => {
      // Primeiro id vira o responsável principal (assignedToId); os demais
      // (deduplicados) somam aos manutentores de apoio já existentes na OS —
      // skipDuplicates evita recriar vínculos já presentes em WorkOrderAssignee.
      const [principalId, ...supportIds] = await resolveAssigneeIds(tx, input.assigneeIds);

      return {
        scheduledStart: input.scheduledStart,
        scheduledEnd: input.scheduledEnd,
        assignedToId: principalId,
        ...(input.estimatedHours !== undefined && { estimatedHours: input.estimatedHours }),
        assignees: {
          createMany: { data: supportIds.map((assigneeId) => ({ userId: assigneeId })), skipDuplicates: true },
        },
      };
    },
  });
}

// Não é uma transição de status — permite ao SUPERVISOR reatribuir técnico
// e/ou reagendar datas a qualquer momento enquanto a OS estiver ativa, sem
// depender da máquina de estados (análoga a registrar()). Reaproveita
// StatusHistory (fromStatus === toStatus === status atual) só para manter
// um rastro de auditoria, já que não há outro mecanismo de log no projeto.
export async function reprogramacao(id: string, input: ReprogramacaoInput, user: AuthPayload) {
  return prisma.$transaction(async (tx) => {
    const workOrder = await tx.workOrder.findUnique({ where: { id } });
    if (!workOrder) {
      throw new AppError(404, "WORK_ORDER_NOT_FOUND", "Ordem de serviço não encontrada.");
    }
    if (workOrder.excludedAt) {
      throw new AppError(409, "ALREADY_EXCLUDED", "Esta OS foi excluída e não pode mais ser alterada.");
    }

    if (workOrder.status === WorkOrderStatus.ENCERRADA || workOrder.status === WorkOrderStatus.CANCELADA) {
      throw new AppError(
        409,
        "INVALID_STATE",
        "OS encerrada/cancelada não pode ser reprogramada."
      );
    }

    if (input.assignedToId) {
      const tecnico = await tx.user.findUnique({ where: { id: input.assignedToId } });
      if (!tecnico || tecnico.role !== Role.TECNICO || !tecnico.active) {
        throw new AppError(
          422,
          "INVALID_ASSIGNEE",
          "O responsável designado deve ser um usuário TECNICO ativo."
        );
      }
    }

    const previousAssignedToId = workOrder.assignedToId;
    const previousScheduledStart = workOrder.scheduledStart;
    const previousScheduledEnd = workOrder.scheduledEnd;

    const updated = await tx.workOrder.update({
      where: { id },
      data: {
        ...(input.assignedToId !== undefined && { assignedToId: input.assignedToId }),
        ...(input.scheduledStart !== undefined && { scheduledStart: input.scheduledStart }),
        ...(input.scheduledEnd !== undefined && { scheduledEnd: input.scheduledEnd }),
      },
      include: workOrderInclude,
    });

    const noteParts: string[] = [];
    if (input.assignedToId !== undefined) {
      noteParts.push(`técnico ${previousAssignedToId ?? "—"} → ${input.assignedToId}`);
    }
    if (input.scheduledStart !== undefined) {
      noteParts.push(`início ${previousScheduledStart?.toISOString() ?? "—"} → ${input.scheduledStart.toISOString()}`);
    }
    if (input.scheduledEnd !== undefined) {
      noteParts.push(`fim ${previousScheduledEnd?.toISOString() ?? "—"} → ${input.scheduledEnd.toISOString()}`);
    }

    await tx.statusHistory.create({
      data: {
        workOrderId: id,
        fromStatus: workOrder.status,
        toStatus: workOrder.status,
        changedById: user.userId,
        note: `Reprogramação: ${noteParts.join("; ")}`,
      },
    });

    return updated;
  });
}

export function iniciar(id: string, input: IniciarInput, user: AuthPayload) {
  return applyTransition({
    id,
    to: WorkOrderStatus.EM_EXECUCAO,
    role: user.role,
    userId: user.userId,
    mutate: async (tx, workOrder) => {
      // Invariante: no máximo uma execução em aberto (finishedAt = null) por OS.
      // Reinício após override do supervisor (OS devolvida a PROGRAMADA com a
      // execução anterior já fechada) abre um novo ciclo; reinício indevido
      // com um ciclo ainda aberto é rejeitado em vez de duplicar a linha.
      const openExecution = await tx.execution.findFirst({
        where: { workOrderId: id, finishedAt: null },
        select: { id: true },
      });
      if (openExecution) {
        throw new AppError(
          409,
          "EXECUTION_ALREADY_OPEN",
          "Já existe uma execução em aberto para esta OS."
        );
      }

      await tx.execution.create({
        data: {
          workOrderId: id,
          riskAnalysis: input.riskAnalysis,
          startedAt: new Date(),
          startedById: user.userId,
          startNote: input.startNote ?? null,
        },
      });

      // Início direto da TRIAGEM ou PLANEJADA (prioridade URGENTE, ver
      // workOrderStateMachine): o técnico ainda não é o assignedTo — auto-atribui.
      const isImmediateStart =
        (workOrder.status === WorkOrderStatus.TRIAGEM || workOrder.status === WorkOrderStatus.PLANEJADA) &&
        !workOrder.assignedToId;
      const principalId = isImmediateStart ? user.userId : workOrder.assignedToId;

      // O principal (auto-atribuído ou já designado na programação) é
      // silenciosamente excluído se vier na lista de apoio — diferente de
      // planejamento(), aqui não é erro do usuário, é o próprio fluxo de
      // auto-atribuição que o torna redundante na lista.
      const assigneeIds = await resolveAssigneeIds(tx, input.assigneeIds ?? [], {
        excludeIds: [principalId],
      });

      return {
        ...(isImmediateStart ? { assignedTo: { connect: { id: user.userId } } } : {}),
        assignees: {
          deleteMany: {},
          create: assigneeIds.map((assigneeId) => ({ userId: assigneeId })),
        },
        numMaintainers: 1 + assigneeIds.length,
      };
    },
  });
}

// Não é uma transição de status (permanece EM_EXECUCAO) — spec 02.8 separa o
// registro de causa/reparo (aqui) do fechamento técnico (encerramentoTecnico).
// Peças usadas são declaradas só no encerramento técnico (obrigatório lá),
// não aqui. Por isso não passa pela máquina de estados nem grava StatusHistory.
export async function registrar(id: string, input: RegistrarInput, user: AuthPayload) {
  return prisma.$transaction(async (tx) => {
    const workOrder = await tx.workOrder.findUnique({
      where: { id },
      include: { assignees: { select: { userId: true } } },
    });
    if (!workOrder) {
      throw new AppError(404, "WORK_ORDER_NOT_FOUND", "Ordem de serviço não encontrada.");
    }

    if (workOrder.status !== WorkOrderStatus.EM_EXECUCAO) {
      throw new AppError(
        409,
        "INVALID_TRANSITION",
        "Só é possível registrar a execução com a OS em EM_EXECUCAO."
      );
    }

    const isSupervisor = user.role === Role.SUPERVISOR;
    const isAssignedTecnico =
      user.role === Role.TECNICO &&
      (user.userId === workOrder.assignedToId || workOrder.assignees.some((a) => a.userId === user.userId));
    if (!isSupervisor && !isAssignedTecnico) {
      throw new AppError(
        403,
        "NOT_ASSIGNED",
        "Somente o técnico responsável ou um supervisor pode registrar a execução."
      );
    }

    const openExecution = await tx.execution.findFirst({
      where: { workOrderId: id, finishedAt: null },
      select: { id: true },
    });
    if (!openExecution) {
      throw new AppError(409, "NO_OPEN_EXECUTION", "Nenhuma execução em aberto para atualizar.");
    }

    // Cada chamada acrescenta uma entrada nova (histórico), em vez de
    // sobrescrever Execution.rootCause/repairDescription (legado, congelado).
    const noteParts = [];
    if (input.rootCause?.trim()) noteParts.push(`Causa raiz: ${input.rootCause.trim()}`);
    if (input.repairDescription?.trim()) noteParts.push(`Descrição: ${input.repairDescription.trim()}`);

    await tx.executionLog.create({
      data: {
        executionId: openExecution.id,
        note: noteParts.join("\n\n"),
        authorId: user.userId,
      },
    });

    return tx.workOrder.findUniqueOrThrow({ where: { id }, include: workOrderInclude });
  });
}

export function encerramentoTecnico(id: string, input: EncerramentoTecnicoInput, user: AuthPayload) {
  return applyTransition({
    id,
    to: WorkOrderStatus.AGUARDANDO_VALIDACAO,
    role: user.role,
    userId: user.userId,
    mutate: async (tx) => {
      const openExecution = await tx.execution.findFirst({
        where: { workOrderId: id, finishedAt: null },
        select: { id: true },
      });
      if (!openExecution) {
        throw new AppError(409, "NO_OPEN_EXECUTION", "Nenhuma execução em aberto para encerrar.");
      }

      await tx.execution.update({
        where: { id: openExecution.id },
        data: {
          testNotes: input.testNotes,
          cleanupDone: input.cleanupDone,
          finishedAt: new Date(),
          endedById: user.userId,
          endNote: input.endNote ?? null,
          outcome: input.outcome ?? null,
        },
      });

      // Declaração de consumo de peças obrigatória no encerramento técnico
      // (encerramentoTecnicoSchema já garante parts ou partsNotApplicable).
      // A OS segue seu fluxo normalmente — a baixa de estoque em si fica
      // pendente de aprovação de quem tem canManageStock (ver §2 do CLAUDE.md).
      await createWithdrawalRequest(tx, {
        workOrderId: id,
        requestedById: user.userId,
        parts: input.parts,
        notApplicable: input.partsNotApplicable,
      });
    },
  });
}

// Replicação automática na Agenda: quando uma OS PREVENTIVA vinculada a um
// MaintenancePlan ativo com periodicidade definida é encerrada, gera sozinho
// o próximo ciclo (equivalente ao "Gerar OS" manual da Agenda), repetindo o
// mesmo técnico responsável + apoio e a mesma duração (scheduledEnd −
// scheduledStart) do ciclo que fechou. Roda DEPOIS que a transição para
// ENCERRADA já commitou (fora da transação de applyTransition, mesmo
// espírito do comentário sobre efeitos colaterais em applyTransition) — uma
// falha aqui nunca pode impedir o encerramento em si, por isso é chamada com
// .catch() em vez de ser aguardada dentro da transação de validar().
async function autoGenerateNextPreventiveCycle(workOrder: WorkOrder, user: AuthPayload): Promise<void> {
  if (!workOrder.maintenancePlanId) return;

  await prisma.$transaction(async (tx) => {
    const plan = await tx.maintenancePlan.findUnique({ where: { id: workOrder.maintenancePlanId! } });
    if (!plan || !plan.active || !plan.periodicity) return;

    const lastExecution = await tx.execution.findFirst({
      where: { workOrderId: workOrder.id, finishedAt: { not: null } },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true },
    });
    if (!lastExecution?.finishedAt) return;

    if (!workOrder.assignedToId) return;

    const due = calculateNextDueDate(
      { id: plan.id, periodicity: plan.periodicity as MaintenancePeriodicity, createdAt: plan.createdAt },
      { finishedAt: lastExecution.finishedAt }
    );
    if (!due.dueDate) return;

    const durationMs =
      workOrder.scheduledStart && workOrder.scheduledEnd
        ? workOrder.scheduledEnd.getTime() - workOrder.scheduledStart.getTime()
        : Number(plan.estimatedHours ?? 2) * 3_600_000;

    const scheduledStart = due.dueDate;
    const scheduledEnd = new Date(scheduledStart.getTime() + durationMs);

    const support = await tx.workOrderAssignee.findMany({
      where: { workOrderId: workOrder.id },
      select: { userId: true },
    });
    const assigneeIds = [workOrder.assignedToId, ...support.map((a) => a.userId)];

    await generateWorkOrderFromPlan(tx, plan, { scheduledStart, scheduledEnd, assigneeIds }, user);
  });
}

export function validar(id: string, input: ValidarInput, user: AuthPayload) {
  if (input.approve) {
    return applyTransition({
      id,
      to: WorkOrderStatus.ENCERRADA,
      role: user.role,
      userId: user.userId,
    }).then(async (updated) => {
      await autoGenerateNextPreventiveCycle(updated, user).catch((err) => {
        console.error(`Falha ao gerar automaticamente o próximo ciclo da OS ${updated.number}:`, err);
      });
      return updated;
    });
  }

  return applyTransition({
    id,
    to: WorkOrderStatus.EM_EXECUCAO,
    role: user.role,
    userId: user.userId,
    note: input.note,
    // Reprovação: a Execution do ciclo anterior já foi fechada em
    // encerramentoTecnico() (finishedAt preenchido) e fica como histórico.
    // Sem abrir uma nova aqui, a OS volta a EM_EXECUCAO sem nenhuma Execution
    // em aberto e registrar()/encerramentoTecnico() falham com
    // NO_OPEN_EXECUTION assim que o técnico tenta usá-los.
    mutate: async (tx) => {
      await tx.execution.create({
        data: {
          workOrderId: id,
          startedAt: new Date(),
          finishedAt: null,
          startedById: user.userId,
        },
      });
    },
  });
}

export function cancelar(id: string, input: CancelarInput, user: AuthPayload) {
  return applyTransition({
    id,
    to: WorkOrderStatus.CANCELADA,
    role: user.role,
    userId: user.userId,
    note: input.note,
    mutate: async (tx) => {
      await tx.execution.updateMany({
        where: { workOrderId: id, finishedAt: null },
        data: { finishedAt: new Date() },
      });
    },
  });
}

// Exclusão lógica (§5.2 do CLAUDE.md, "baú de cancelados e excluídos") —
// exclusiva do SUPERVISOR (§ rota). Propositalmente NÃO usa
// applyTransition/canTransition: não é uma transição de status (a OS
// continua ABERTA, só ganha os 3 campos de exclusão), mesmo espírito de
// reprogramacao(). Só elegível em ABERTA — qualquer OS que já andou (a
// partir de TRIAGEM) usa cancelar() (CANCELADA), nunca isto; a exclusão não
// apaga a linha, só a tira das telas operacionais e de todo indicador,
// mantendo-a visível (com motivo/autor/data) só no Baú.
export async function excluir(id: string, input: ExcluirInput, user: AuthPayload) {
  return prisma.$transaction(async (tx) => {
    const workOrder = await tx.workOrder.findUnique({ where: { id } });
    if (!workOrder) {
      throw new AppError(404, "WORK_ORDER_NOT_FOUND", "Ordem de serviço não encontrada.");
    }

    if (workOrder.excludedAt) {
      throw new AppError(409, "ALREADY_EXCLUDED", "Esta OS já foi excluída.");
    }

    if (workOrder.status !== WorkOrderStatus.ABERTA) {
      throw new AppError(
        422,
        "WORK_ORDER_NOT_IN_INITIAL_PHASE",
        "Só é possível excluir uma OS que ainda não saiu da fase inicial (ABERTA). Para uma OS em andamento, use o cancelamento."
      );
    }

    const updated = await tx.workOrder.update({
      where: { id },
      data: {
        excludedAt: new Date(),
        excludedById: user.userId,
        exclusionReason: input.reason,
      },
      include: workOrderInclude,
    });

    await tx.statusHistory.create({
      data: {
        workOrderId: id,
        fromStatus: workOrder.status,
        toStatus: workOrder.status,
        changedById: user.userId,
        note: `[EXCLUSÃO] ${input.reason}`,
      },
    });

    // Cascata pro plano rascunho (ver CLAUDE.md §5.2): só quando esta OS era
    // a única (ou a última não-excluída) vinculada a um plano ainda sem
    // periodicidade — um plano que já tem outra OS de verdade não é tocado.
    if (workOrder.maintenancePlanId) {
      const plan = await tx.maintenancePlan.findUnique({ where: { id: workOrder.maintenancePlanId } });
      if (plan && plan.periodicity === null && !plan.excludedAt) {
        const otherActiveWorkOrders = await tx.workOrder.count({
          where: { maintenancePlanId: plan.id, id: { not: id }, excludedAt: null },
        });
        if (otherActiveWorkOrders === 0) {
          await tx.maintenancePlan.update({
            where: { id: plan.id },
            data: {
              excludedAt: new Date(),
              excludedById: user.userId,
              exclusionReason: `Plano rascunho excluído automaticamente junto com a OS ${workOrder.number} (${input.reason}).`,
            },
          });
        }
      }
    }

    return updated;
  });
}

// Override manual da linha do tempo — exclusivo do SUPERVISOR (§ rota).
// Propositalmente NÃO usa applyTransition/canTransition: é uma ação de
// exceção que pode mover a OS para qualquer status, inclusive retrocedendo
// ou saindo de ENCERRADA/CANCELADA. Não mexe em dados de planejamento — só o
// status muda e, se houver uma Execution vigente (finishedAt = null), ela é
// encerrada (ver comentário abaixo) para não travar um reinício futuro. A
// auditoria fica marcada com prefixo "[OVERRIDE SUPERVISOR]" no StatusHistory
// para se distinguir das transições normais.
export function timelineOverride(id: string, dto: TimelineOverrideInput, user: AuthPayload) {
  return prisma.$transaction(async (tx) => {
    const workOrder = await tx.workOrder.findUnique({ where: { id } });
    if (!workOrder) {
      throw new AppError(404, "WORK_ORDER_NOT_FOUND", "Ordem de serviço não encontrada.");
    }
    if (workOrder.excludedAt) {
      throw new AppError(409, "ALREADY_EXCLUDED", "Esta OS foi excluída e não pode mais ser alterada.");
    }

    if (!Object.values(WorkOrderStatus).includes(dto.toStatus as WorkOrderStatus)) {
      throw new AppError(400, "INVALID_STATUS", "Status de destino inválido.");
    }

    if (dto.toStatus === workOrder.status) {
      throw new AppError(409, "NO_CHANGE", "A OS já está neste status.");
    }

    if (dto.toStatus === WorkOrderStatus.ENCERRADA) {
      await assertNoOpenSubtasks(tx, id);
    }

    // Devolver para uma fase pré-atribuição "renova" o ciclo: assignedToId
    // some junto, senão o próximo iniciar() (isImmediateStart) vê o campo já
    // preenchido com o responsável do ciclo anterior e não reatribui a quem
    // de fato reinicia a execução (ver diagnóstico da OS-2026-000001).
    const resetsAssignment =
      dto.toStatus === WorkOrderStatus.ABERTA ||
      dto.toStatus === WorkOrderStatus.TRIAGEM ||
      dto.toStatus === WorkOrderStatus.PLANEJADA;

    await tx.workOrder.update({
      where: { id },
      data: {
        status: dto.toStatus,
        ...(resetsAssignment && { assignedToId: null }),
      },
    });

    // Override pode devolver a OS para antes de EM_EXECUCAO, deixando a
    // Execution vigente órfã (finishedAt = null) e travando um reinício
    // futuro no guard EXECUTION_ALREADY_OPEN de iniciar(). Encerrar aqui
    // mantém o registro histórico e libera a OS para um novo ciclo.
    const { count: closedExecutions } = await tx.execution.updateMany({
      where: { workOrderId: id, finishedAt: null },
      data: { finishedAt: new Date() },
    });

    // Destino EM_EXECUCAO: as ações naturais dessa fase (registrar,
    // encerramento técnico) exigem uma Execution em aberto — sem isso, a OS
    // fica visivelmente em EM_EXECUCAO mas registrar()/encerramentoTecnico()
    // falham com NO_OPEN_EXECUTION (mesma causa raiz corrigida em validar()).
    if (dto.toStatus === WorkOrderStatus.EM_EXECUCAO) {
      await tx.execution.create({
        data: {
          workOrderId: id,
          startedAt: new Date(),
          finishedAt: null,
          startedById: user.userId,
        },
      });
    }

    await tx.statusHistory.create({
      data: {
        workOrderId: id,
        fromStatus: workOrder.status,
        toStatus: dto.toStatus,
        changedById: user.userId,
        note: closedExecutions
          ? `[OVERRIDE SUPERVISOR] ${dto.note} (execução vigente encerrada automaticamente)`
          : `[OVERRIDE SUPERVISOR] ${dto.note}`,
      },
    });

    return tx.workOrder.findUniqueOrThrow({ where: { id }, include: workOrderInclude });
  });
}
