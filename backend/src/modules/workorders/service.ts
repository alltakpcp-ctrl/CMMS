import { Prisma, WorkOrder } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../lib/AppError";
import { publicUserSelect } from "../../lib/publicUser";
import { generateWorkOrderNumber } from "../../lib/workOrderNumber";
import { canTransition, TransitionContext } from "../../lib/workOrderStateMachine";
import { assertActiveSector } from "../../lib/sectors";
import { recordStockMovement } from "../stock/service";
import { AuthPayload } from "../../middlewares/authenticate";
import { Role, WorkOrderStatus } from "../../domain/enums";
import {
  CancelarInput,
  CreateWorkOrderInput,
  EncerramentoTecnicoInput,
  IniciarInput,
  ListWorkOrdersQuery,
  PlanejamentoInput,
  ProgramacaoInput,
  RegistrarInput,
  ReprogramacaoInput,
  TimelineOverrideInput,
  TriagemInput,
  ValidarInput,
} from "./schema";

const workOrderInclude = {
  asset: true,
  targetSector: true,
  requester: { select: publicUserSelect },
  assignedTo: { select: publicUserSelect },
  assignees: { include: { user: { select: { id: true, name: true } } } },
  executions: {
    orderBy: { startedAt: "asc" },
    include: {
      logs: {
        include: { author: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  },
  parts: { include: { part: true } },
  plannedPartItems: { include: { part: true } },
} satisfies Prisma.WorkOrderInclude;

// Valida a lista de manutentores de apoio (assigneeIds) para planejamento()/
// iniciar(): dedup, todos devem ser TECNICO ativo, e nenhum pode coincidir
// com o responsável principal (rejectIds) — ou é removido da lista
// silenciosamente quando for o próprio auto-atribuído (excludeIds), caso do
// início imediato em iniciar().
async function resolveAssigneeIds(
  tx: Prisma.TransactionClient,
  assigneeIds: string[],
  options: { rejectIds?: Array<string | null | undefined>; excludeIds?: Array<string | null | undefined> } = {}
): Promise<string[]> {
  const excludeSet = new Set(options.excludeIds?.filter((id): id is string => Boolean(id)));
  const rejectSet = new Set(options.rejectIds?.filter((id): id is string => Boolean(id)));

  const deduped = Array.from(new Set(assigneeIds)).filter((id) => !excludeSet.has(id));

  if (deduped.some((id) => rejectSet.has(id))) {
    throw new AppError(
      422,
      "INVALID_ASSIGNEE",
      "O responsável pela OS não pode constar também como manutentor de apoio."
    );
  }

  if (deduped.length === 0) {
    return [];
  }

  const found = await tx.user.findMany({
    where: { id: { in: deduped } },
    select: { id: true, role: true, active: true },
  });
  const validIds = new Set(found.filter((u) => u.role === Role.TECNICO && u.active).map((u) => u.id));
  const allValid = deduped.every((id) => validIds.has(id));

  if (!allValid) {
    throw new AppError(
      422,
      "INVALID_ASSIGNEE",
      "Todos os manutentores de apoio devem ser usuários TECNICO ativos."
    );
  }

  return deduped;
}

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
      },
      include: workOrderInclude,
    });

    await tx.statusHistory.create({
      data: {
        workOrderId: workOrder.id,
        fromStatus: null,
        toStatus: WorkOrderStatus.ABERTA,
        changedById: user.userId,
      },
    });

    return workOrder;
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
    ...(rest.status && { status: rest.status }),
    ...(rest.type && { type: rest.type }),
    ...(targetSectorId && { targetSectorId }),
    ...(rest.assetId && { assetId: rest.assetId }),
    ...(rest.assignedToId && { assignedToId: rest.assignedToId }),
    ...(rest.requesterId && { requesterId: rest.requesterId }),
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
    const workOrder = await tx.workOrder.findUnique({ where: { id } });
    if (!workOrder) {
      throw new AppError(404, "WORK_ORDER_NOT_FOUND", "Ordem de serviço não encontrada.");
    }

    const result = canTransition({
      from: workOrder.status as WorkOrderStatus,
      to,
      role,
      context: {
        userId,
        role,
        assignedToId: workOrder.assignedToId,
        note,
        priority: workOrder.priority,
        ...context,
      },
    });

    if (!result.ok) {
      const status = result.code === "ROLE_FORBIDDEN" || result.code === "NOT_ASSIGNED" ? 403 : 409;
      throw new AppError(status, result.code ?? "INVALID_TRANSITION", result.reason ?? "Transição inválida.");
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

      if (input.priority === workOrder.priority) {
        return { priority: input.priority, targetSectorId: input.targetSectorId };
      }

      return {
        priority: input.priority,
        targetSectorId: input.targetSectorId,
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
        estimatedMinutes: input.estimatedMinutes,
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
        data: { workOrderId: id, riskAnalysis: input.riskAnalysis, startedAt: new Date() },
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
// registro de causa/reparo/peças (aqui) do fechamento técnico (encerramentoTecnico).
// Por isso não passa pela máquina de estados nem grava StatusHistory.
export async function registrar(id: string, input: RegistrarInput, user: AuthPayload) {
  return prisma.$transaction(async (tx) => {
    const workOrder = await tx.workOrder.findUnique({ where: { id } });
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
    const isAssignedTecnico = user.role === Role.TECNICO && user.userId === workOrder.assignedToId;
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

    // GANCHO FUTURO (§5.6): a baixa abaixo é direta e imediata (decisão de MVP,
    // §2 do CLAUDE.md). Um futuro perfil ALMOXARIFE entraria aqui como uma
    // etapa intermediária de aprovação — em vez de decrementar `stockQty` na
    // hora, criaria uma "solicitação de retirada" pendente, e só o almoxarife
    // aprovando é que executaria o decremento. NÃO implementado no MVP.
    for (const item of input.parts ?? []) {
      const part = await tx.part.findUnique({ where: { id: item.partId } });
      if (!part) {
        throw new AppError(404, "PART_NOT_FOUND", `Peça ${item.partId} não encontrada.`);
      }
      if (part.stockQty < item.quantity) {
        throw new AppError(422, "INSUFFICIENT_STOCK", `Saldo insuficiente para a peça ${part.description}.`);
      }
      await tx.workOrderPart.create({ data: { workOrderId: id, partId: item.partId, quantity: item.quantity } });
      await recordStockMovement(tx, {
        partId: item.partId,
        type: "SAIDA",
        quantity: item.quantity,
        workOrderId: id,
        userId: user.userId,
        reason: "Baixa por execução de OS",
      });
    }

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
        data: { testNotes: input.testNotes, cleanupDone: input.cleanupDone, finishedAt: new Date() },
      });
    },
  });
}

export function validar(id: string, input: ValidarInput, user: AuthPayload) {
  if (input.approve) {
    return applyTransition({
      id,
      to: WorkOrderStatus.ENCERRADA,
      role: user.role,
      userId: user.userId,
    });
  }

  return applyTransition({
    id,
    to: WorkOrderStatus.EM_EXECUCAO,
    role: user.role,
    userId: user.userId,
    note: input.note,
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

    if (!Object.values(WorkOrderStatus).includes(dto.toStatus as WorkOrderStatus)) {
      throw new AppError(400, "INVALID_STATUS", "Status de destino inválido.");
    }

    if (dto.toStatus === workOrder.status) {
      throw new AppError(409, "NO_CHANGE", "A OS já está neste status.");
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
