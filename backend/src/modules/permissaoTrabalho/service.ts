import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../lib/AppError";
import { AuthPayload } from "../../middlewares/authenticate";
import { Role } from "../../domain/enums";
import { PermissaoTrabalhoStatus } from "../../domain/enums";
import { PatchRespostaInput, PatchStatusInput } from "./schema";

const ptInclude = {
  respostas: { orderBy: { ordem: "asc" as const } },
  approvedBy: { select: { id: true, name: true } },
};

async function registrarEventoPT(
  tx: Prisma.TransactionClient,
  workOrderId: string,
  changedById: string,
  note: string
) {
  const wo = await tx.workOrder.findUniqueOrThrow({
    where: { id: workOrderId },
    select: { status: true },
  });
  await tx.statusHistory.create({
    data: {
      workOrderId,
      fromStatus: wo.status,
      toStatus: wo.status,
      changedById,
      note,
    },
  });
}

function contarRespostas(respostas: { resposta: string | null }[]) {
  const sim = respostas.filter((r) => r.resposta === "SIM").length;
  const nao = respostas.filter((r) => r.resposta === "NAO").length;
  const na = respostas.filter((r) => r.resposta === "NA").length;
  return { sim, nao, na };
}

export async function getByWorkOrderId(workOrderId: string) {
  const pt = await prisma.permissaoTrabalho.findUnique({
    where: { workOrderId },
    include: ptInclude,
  });
  if (!pt) {
    throw new AppError(404, "PT_NOT_FOUND", "Permissão de Trabalho não encontrada para esta OS.");
  }
  return pt;
}

const STATUS_EDITAVEL = [
  PermissaoTrabalhoStatus.RASCUNHO,
  PermissaoTrabalhoStatus.PREENCHIDA,
  PermissaoTrabalhoStatus.REPROVADA,
];

export async function patchResposta(respostaId: string, input: PatchRespostaInput, user: AuthPayload) {
  const resposta = await prisma.permissaoTrabalhoResposta.findUnique({
    where: { id: respostaId },
    include: { permissaoTrabalho: true },
  });
  if (!resposta) {
    throw new AppError(404, "RESPOSTA_NOT_FOUND", "Resposta não encontrada.");
  }
  if (!STATUS_EDITAVEL.includes(resposta.permissaoTrabalho.status as any)) {
    throw new AppError(422, "PT_NOT_EDITABLE", "PT não pode ser editada no status atual.");
  }

  return prisma.$transaction(async (tx) => {
    await tx.permissaoTrabalhoResposta.update({
      where: { id: respostaId },
      data: {
        resposta: input.resposta ?? null,
        observacao: input.observacao ?? null,
      },
    });

    const ptId = resposta.permissaoTrabalhoId;
    const todas = await tx.permissaoTrabalhoResposta.findMany({
      where: { permissaoTrabalhoId: ptId },
      select: { resposta: true },
    });
    const atual = resposta.permissaoTrabalho.status;
    const completa = todas.every((r) => r.resposta !== null);

    // alvo quando completa: auto-submete direto para aprovação (sem passo manual)
    const alvoCompleta = PermissaoTrabalhoStatus.AGUARDANDO_APROVACAO;

    let novoStatus: string | null = null;
    if (atual === PermissaoTrabalhoStatus.RASCUNHO || atual === PermissaoTrabalhoStatus.REPROVADA) {
      novoStatus = completa ? alvoCompleta : PermissaoTrabalhoStatus.RASCUNHO;
    }
    // se atual já era PREENCHIDA/AGUARDANDO_APROVACAO, não rebaixa aqui (edição bloqueada nesses status pelo guard de editabilidade)

    if (novoStatus && novoStatus !== atual) {
      await tx.permissaoTrabalho.update({ where: { id: ptId }, data: { status: novoStatus } });
    }

    const virouCompleta =
      (atual === PermissaoTrabalhoStatus.RASCUNHO || atual === PermissaoTrabalhoStatus.REPROVADA) &&
      completa;

    if (virouCompleta) {
      const { sim, nao, na } = contarRespostas(todas);
      await registrarEventoPT(
        tx,
        resposta.permissaoTrabalho.workOrderId,
        user.userId,
        `[PT] Enviada para aprovação — ${sim} Sim, ${nao} Não, ${na} N/A`
      );
    }

    return tx.permissaoTrabalho.findUniqueOrThrow({ where: { id: ptId }, include: ptInclude });
  });
}

export async function patchStatus(ptId: string, input: PatchStatusInput, user: AuthPayload) {
  const pt = await prisma.permissaoTrabalho.findUnique({
    where: { id: ptId },
    include: { respostas: { select: { resposta: true } } },
  });
  if (!pt) {
    throw new AppError(404, "PT_NOT_FOUND", "Permissão de Trabalho não encontrada.");
  }

  if (input.acao === "submeter") {
    if (pt.status !== PermissaoTrabalhoStatus.PREENCHIDA) {
      throw new AppError(422, "PT_INVALID_STATE", "Só é possível submeter uma PT preenchida.");
    }
    const completa = pt.respostas.every((r) => r.resposta !== null);
    if (!completa) {
      throw new AppError(422, "PT_INCOMPLETE", "Todas as perguntas devem ser respondidas antes de submeter.");
    }
    return prisma.$transaction(async (tx) => {
      const updated = await tx.permissaoTrabalho.update({
        where: { id: ptId },
        data: { status: PermissaoTrabalhoStatus.AGUARDANDO_APROVACAO },
        include: ptInclude,
      });
      await registrarEventoPT(tx, pt.workOrderId, user.userId, "[PT] Submetida para aprovação");
      return updated;
    });
  }

  if (input.acao === "liberar") {
    if (user.role !== Role.SUPERVISOR && user.role !== Role.SEGURANCA) {
      throw new AppError(403, "FORBIDDEN", "Apenas supervisor ou técnico de segurança pode liberar a PT.");
    }
    if (pt.status !== PermissaoTrabalhoStatus.AGUARDANDO_ASSINATURAS) {
      throw new AppError(422, "PT_INVALID_STATE", "Só é possível liberar uma PT que aguarda assinaturas.");
    }
    return prisma.$transaction(async (tx) => {
      const total = await tx.permissaoTrabalhoAssinatura.count({
        where: { permissaoTrabalhoId: ptId },
      });
      if (total > 0) {
        throw new AppError(
          422,
          "PT_TEM_ASSINANTES",
          "A PT possui assinantes; a liberação manual só é permitida quando a lista está vazia."
        );
      }
      const updated = await tx.permissaoTrabalho.update({
        where: { id: ptId },
        data: { status: PermissaoTrabalhoStatus.LIBERADA },
        include: ptInclude,
      });
      await registrarEventoPT(tx, pt.workOrderId, user.userId, "[PT] Liberada manualmente (sem assinantes)");
      return updated;
    });
  }

  // aprovar / reprovar — só SEGURANCA
  if (user.role !== Role.SEGURANCA) {
    throw new AppError(403, "FORBIDDEN", "Apenas o técnico de segurança pode aprovar ou reprovar a PT.");
  }
  if (pt.status !== PermissaoTrabalhoStatus.AGUARDANDO_APROVACAO) {
    throw new AppError(422, "PT_INVALID_STATE", "PT não está aguardando aprovação.");
  }

  if (input.acao === "aprovar") {
    return prisma.$transaction(async (tx) => {
      const workOrder = await tx.workOrder.findUniqueOrThrow({
        where: { id: pt.workOrderId },
        select: { assignedToId: true, assignees: { select: { userId: true } } },
      });
      const signatariosIds = Array.from(
        new Set(
          [workOrder.assignedToId, ...workOrder.assignees.map((a) => a.userId)].filter(
            (v): v is string => Boolean(v)
          )
        )
      );

      const updated = await tx.permissaoTrabalho.update({
        where: { id: ptId },
        data: {
          status: PermissaoTrabalhoStatus.AGUARDANDO_ASSINATURAS,
          emittedAt: new Date(),
          approvedById: user.userId,
          approvedAt: new Date(),
          rejectionReason: null,
        },
        include: ptInclude,
      });

      if (signatariosIds.length > 0) {
        await tx.permissaoTrabalhoAssinatura.createMany({
          data: signatariosIds.map((uid) => ({
            permissaoTrabalhoId: ptId,
            userId: uid,
            requestedById: user.userId,
          })),
          skipDuplicates: true,
        });
      }

      await registrarEventoPT(tx, pt.workOrderId, user.userId, "[PT] Aprovada — aguardando assinaturas");
      return updated;
    });
  }

  // reprovar → volta para PREENCHIDA (editável)
  return prisma.$transaction(async (tx) => {
    const updated = await tx.permissaoTrabalho.update({
      where: { id: ptId },
      data: { status: PermissaoTrabalhoStatus.PREENCHIDA, rejectionReason: input.motivo },
      include: ptInclude,
    });
    await registrarEventoPT(tx, pt.workOrderId, user.userId, `[PT] Reprovada: ${input.motivo}`);
    return updated;
  });
}

export async function checkpoint(ptId: string, user: AuthPayload) {
  const pt = await prisma.permissaoTrabalho.findUnique({
    where: { id: ptId },
    include: { respostas: { select: { resposta: true } } },
  });
  if (!pt) {
    throw new AppError(404, "PT_NOT_FOUND", "Permissão de Trabalho não encontrada.");
  }
  // só registra checkpoint de edição quando a PT já passou de preenchida
  const statusComEdicaoRegistravel = [
    PermissaoTrabalhoStatus.PREENCHIDA,
    PermissaoTrabalhoStatus.AGUARDANDO_APROVACAO,
  ];
  if (!statusComEdicaoRegistravel.includes(pt.status as any)) {
    return pt; // no-op silencioso — nada a registrar
  }
  const { sim, nao, na } = contarRespostas(pt.respostas);
  return prisma.$transaction(async (tx) => {
    await registrarEventoPT(
      tx,
      pt.workOrderId,
      user.userId,
      `[PT] Alterada — ${sim} Sim, ${nao} Não, ${na} N/A`
    );
    return tx.permissaoTrabalho.findUniqueOrThrow({ where: { id: ptId }, include: ptInclude });
  });
}

const assinaturaUserSelect = { select: { id: true, name: true } };

export async function solicitarAssinatura(ptId: string, userId: string, user: AuthPayload) {
  if (user.role !== Role.SUPERVISOR) {
    throw new AppError(403, "FORBIDDEN", "Apenas supervisor pode gerenciar a lista de assinantes.");
  }

  return prisma.$transaction(async (tx) => {
    const pt = await tx.permissaoTrabalho.findUnique({ where: { id: ptId } });
    if (!pt) {
      throw new AppError(404, "PT_NOT_FOUND", "Permissão de Trabalho não encontrada.");
    }
    if (pt.status !== PermissaoTrabalhoStatus.AGUARDANDO_ASSINATURAS) {
      throw new AppError(
        422,
        "PT_INVALID_STATE",
        "A lista de assinantes só pode ser alterada enquanto a PT aguarda assinaturas."
      );
    }

    const targetUser = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!targetUser) {
      throw new AppError(404, "USER_NOT_FOUND", "Usuário não encontrado.");
    }

    const existente = await tx.permissaoTrabalhoAssinatura.findUnique({
      where: { permissaoTrabalhoId_userId: { permissaoTrabalhoId: ptId, userId } },
    });
    if (existente) {
      throw new AppError(409, "ASSINATURA_DUPLICADA", "Este usuário já está na lista de assinantes.");
    }

    return tx.permissaoTrabalhoAssinatura.create({
      data: { permissaoTrabalhoId: ptId, userId, requestedById: user.userId },
      include: { user: assinaturaUserSelect, requestedBy: assinaturaUserSelect },
    });
  });
}

export async function removerAssinatura(assinaturaId: string, user: AuthPayload) {
  if (user.role !== Role.SUPERVISOR) {
    throw new AppError(403, "FORBIDDEN", "Apenas supervisor pode gerenciar a lista de assinantes.");
  }

  return prisma.$transaction(async (tx) => {
    const assinatura = await tx.permissaoTrabalhoAssinatura.findUnique({
      where: { id: assinaturaId },
      include: { permissaoTrabalho: { select: { status: true } } },
    });
    if (!assinatura) {
      throw new AppError(404, "ASSINATURA_NOT_FOUND", "Assinatura não encontrada.");
    }
    if (assinatura.permissaoTrabalho.status !== PermissaoTrabalhoStatus.AGUARDANDO_ASSINATURAS) {
      throw new AppError(
        422,
        "PT_INVALID_STATE",
        "A lista de assinantes só pode ser alterada enquanto a PT aguarda assinaturas."
      );
    }
    if (assinatura.signedAt) {
      throw new AppError(422, "ASSINATURA_JA_ASSINADA", "Não é possível remover uma assinatura já registrada.");
    }

    return tx.permissaoTrabalhoAssinatura.delete({ where: { id: assinaturaId } });
  });
}

export async function assinar(assinaturaId: string, user: AuthPayload) {
  return prisma.$transaction(async (tx) => {
    const assinatura = await tx.permissaoTrabalhoAssinatura.findUnique({
      where: { id: assinaturaId },
      include: { permissaoTrabalho: { select: { status: true, workOrderId: true } } },
    });
    if (!assinatura) {
      throw new AppError(404, "ASSINATURA_NOT_FOUND", "Assinatura não encontrada.");
    }
    if (assinatura.userId !== user.userId) {
      throw new AppError(403, "FORBIDDEN", "Você só pode assinar a sua própria pendência.");
    }
    if (assinatura.signedAt) {
      throw new AppError(422, "ASSINATURA_JA_ASSINADA", "Esta assinatura já foi registrada.");
    }
    if (assinatura.permissaoTrabalho.status !== PermissaoTrabalhoStatus.AGUARDANDO_ASSINATURAS) {
      throw new AppError(422, "PT_INVALID_STATE", "A PT não está aguardando assinaturas.");
    }

    const assinada = await tx.permissaoTrabalhoAssinatura.update({
      where: { id: assinaturaId },
      data: { signedAt: new Date() },
      include: { user: assinaturaUserSelect },
    });

    const pendentes = await tx.permissaoTrabalhoAssinatura.count({
      where: { permissaoTrabalhoId: assinatura.permissaoTrabalhoId, signedAt: null },
    });
    if (pendentes === 0) {
      await tx.permissaoTrabalho.update({
        where: { id: assinatura.permissaoTrabalhoId },
        data: { status: PermissaoTrabalhoStatus.LIBERADA },
      });
      await registrarEventoPT(
        tx,
        assinatura.permissaoTrabalho.workOrderId,
        user.userId,
        "[PT] Liberada — todas as assinaturas coletadas"
      );
    }

    return assinada;
  });
}

export function listarMinhasPendencias(user: AuthPayload) {
  return prisma.permissaoTrabalhoAssinatura.findMany({
    where: { userId: user.userId, signedAt: null },
    orderBy: { requestedAt: "asc" },
    include: {
      permissaoTrabalho: {
        select: {
          id: true,
          status: true,
          workOrder: { select: { id: true, number: true, title: true } },
        },
      },
    },
  });
}
