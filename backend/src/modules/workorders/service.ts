import { Prisma, WorkOrder } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../lib/AppError";
import { publicUserSelect } from "../../lib/publicUser";
import { generateWorkOrderNumber } from "../../lib/workOrderNumber";
import { canTransition, TransitionContext } from "../../lib/workOrderStateMachine";
import { assertActiveSector } from "../../lib/sectors";
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
  execution: true,
  parts: { include: { part: true } },
  plannedPartItems: { include: { part: true } },
} satisfies Prisma.WorkOrderInclude;

export async function createWorkOrder(input: CreateWorkOrderInput, user: AuthPayload) {
  const asset = await prisma.asset.findUnique({ where: { id: input.assetId } });
  if (!asset) {
    throw new AppError(404, "ASSET_NOT_FOUND", "Ativo não encontrado.");
  }
  // Operador só abre OS para ativos do próprio setor (asset.sectorId).
  // SUPERVISOR não tem essa restrição.
  if (user.role === Role.OPERADOR) {
    const operador = await prisma.user.findUnique({ where: { id: user.userId }, select: { sectorId: true } });
    if (!operador?.sectorId) {
      throw new AppError(403, "OPERATOR_WITHOUT_SECTOR", "Operador sem setor não pode abrir solicitação.");
    }
    if (asset.sectorId !== operador.sectorId) {
      throw new AppError(403, "ASSET_OUT_OF_SECTOR", "Ativo fora do setor do operador.");
    }
  }

  return prisma.$transaction(async (tx) => {
    const number = await generateWorkOrderNumber(tx);

    const workOrder = await tx.workOrder.create({
      data: {
        number,
        type: input.type,
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
    mutate: async (tx) => {
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

      return {
        plan: input.plan,
        numMaintainers: input.numMaintainers,
        estimatedMinutes: input.estimatedMinutes,
        tools: input.tools,
        ppe: input.ppe,
        plannedPartItems: {
          create: plannedParts.map((p) => ({ partId: p.partId, quantity: p.quantity })),
        },
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
      hasAssignedTechnician: Boolean(input.assignedToId),
    },
    mutate: async (tx) => {
      const tecnico = await tx.user.findUnique({ where: { id: input.assignedToId } });
      if (!tecnico || tecnico.role !== Role.TECNICO || !tecnico.active) {
        throw new AppError(
          422,
          "INVALID_ASSIGNEE",
          "O responsável designado deve ser um usuário TECNICO ativo."
        );
      }
      return {
        scheduledStart: input.scheduledStart,
        scheduledEnd: input.scheduledEnd,
        assignedToId: input.assignedToId,
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
      await tx.execution.create({
        data: { workOrderId: id, riskAnalysis: input.riskAnalysis, startedAt: new Date() },
      });

      // Início direto da TRIAGEM ou PLANEJADA (prioridade URGENTE, ver
      // workOrderStateMachine): o técnico ainda não é o assignedTo — auto-atribui.
      if (
        (workOrder.status === WorkOrderStatus.TRIAGEM || workOrder.status === WorkOrderStatus.PLANEJADA) &&
        !workOrder.assignedToId
      ) {
        return { assignedTo: { connect: { id: user.userId } } };
      }
      return {};
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

    await tx.execution.update({
      where: { workOrderId: id },
      data: { rootCause: input.rootCause, repairDescription: input.repairDescription },
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
      await tx.part.update({ where: { id: item.partId }, data: { stockQty: { decrement: item.quantity } } });
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
      await tx.execution.update({
        where: { workOrderId: id },
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
  });
}

// Override manual da linha do tempo — exclusivo do SUPERVISOR (§ rota).
// Propositalmente NÃO usa applyTransition/canTransition: é uma ação de
// exceção que pode mover a OS para qualquer status, inclusive retrocedendo
// ou saindo de ENCERRADA/CANCELADA. Não mexe em dados de execução/planejamento
// — só o status muda, e a auditoria fica marcada com prefixo "[OVERRIDE
// SUPERVISOR]" no StatusHistory para se distinguir das transições normais.
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

    await tx.workOrder.update({
      where: { id },
      data: { status: dto.toStatus },
    });

    await tx.statusHistory.create({
      data: {
        workOrderId: id,
        fromStatus: workOrder.status,
        toStatus: dto.toStatus,
        changedById: user.userId,
        note: `[OVERRIDE SUPERVISOR] ${dto.note}`,
      },
    });

    return tx.workOrder.findUniqueOrThrow({ where: { id }, include: workOrderInclude });
  });
}
