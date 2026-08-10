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
    const completa = todas.every((r) => r.resposta !== null);
    const novoStatus = completa
      ? PermissaoTrabalhoStatus.PREENCHIDA
      : PermissaoTrabalhoStatus.RASCUNHO;

    // só recalcula entre RASCUNHO/PREENCHIDA; nunca rebaixa REPROVADA aqui
    const atual = resposta.permissaoTrabalho.status;
    if (atual === PermissaoTrabalhoStatus.RASCUNHO || atual === PermissaoTrabalhoStatus.PREENCHIDA) {
      await tx.permissaoTrabalho.update({ where: { id: ptId }, data: { status: novoStatus } });
    } else if (atual === PermissaoTrabalhoStatus.REPROVADA && completa) {
      await tx.permissaoTrabalho.update({ where: { id: ptId }, data: { status: PermissaoTrabalhoStatus.PREENCHIDA } });
    }

    const virouPreenchida =
      (atual === PermissaoTrabalhoStatus.RASCUNHO || atual === PermissaoTrabalhoStatus.REPROVADA) &&
      completa;

    if (virouPreenchida) {
      const { sim, nao, na } = contarRespostas(todas);
      await registrarEventoPT(
        tx,
        resposta.permissaoTrabalho.workOrderId,
        user.userId,
        `[PT] Preenchida — ${sim} Sim, ${nao} Não, ${na} N/A`
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

  // aprovar / reprovar — só SUPERVISOR
  if (user.role !== Role.SUPERVISOR) {
    throw new AppError(403, "FORBIDDEN", "Apenas supervisor pode aprovar ou reprovar a PT.");
  }
  if (pt.status !== PermissaoTrabalhoStatus.AGUARDANDO_APROVACAO) {
    throw new AppError(422, "PT_INVALID_STATE", "PT não está aguardando aprovação.");
  }

  if (input.acao === "aprovar") {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.permissaoTrabalho.update({
        where: { id: ptId },
        data: {
          status: PermissaoTrabalhoStatus.APROVADA,
          emittedAt: new Date(),
          approvedById: user.userId,
          approvedAt: new Date(),
        },
        include: ptInclude,
      });
      await registrarEventoPT(tx, pt.workOrderId, user.userId, "[PT] Aprovada");
      return updated;
    });
  }

  // reprovar → volta para PREENCHIDA (editável)
  return prisma.$transaction(async (tx) => {
    const updated = await tx.permissaoTrabalho.update({
      where: { id: ptId },
      data: { status: PermissaoTrabalhoStatus.PREENCHIDA },
      include: ptInclude,
    });
    await registrarEventoPT(tx, pt.workOrderId, user.userId, "[PT] Reprovada");
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
