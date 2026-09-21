import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../lib/AppError";
import { publicUserSelect } from "../../lib/publicUser";
import { recordStockMovement } from "../stock/service";
import { AuthPayload } from "../../middlewares/authenticate";
import { StockWithdrawalStatus } from "../../domain/enums";
import { PartsConsumptionInput, ReviewStockWithdrawalInput } from "./schema";

export const stockWithdrawalInclude = {
  items: { include: { part: true } },
  workOrder: { select: { id: true, number: true, title: true } },
  subtask: { select: { id: true, title: true } },
  requestedBy: { select: publicUserSelect },
  reviewedBy: { select: publicUserSelect },
} satisfies Prisma.StockWithdrawalRequestInclude;

interface CreateWithdrawalRequestParams {
  workOrderId: string;
  subtaskId?: string;
  requestedById: string;
  parts?: PartsConsumptionInput["parts"];
  notApplicable?: boolean;
}

// Chamada de dentro da transação de encerramentoTecnico()/finishSubtask() —
// a declaração de consumo (ou "não aplica") nasce junto com a transição, não
// existe caminho para encerrar sem passar por aqui. Quando notApplicable, a
// request já nasce resolvida (nada para o almoxarife revisar); quando há
// itens, fica PENDENTE até alguém com canManageStock aprovar (ver
// reviewStockWithdrawalRequest) — só aí o estoque é de fato debitado.
export async function createWithdrawalRequest(
  tx: Prisma.TransactionClient,
  { workOrderId, subtaskId, requestedById, parts, notApplicable }: CreateWithdrawalRequestParams
) {
  const items = notApplicable ? [] : parts ?? [];

  return tx.stockWithdrawalRequest.create({
    data: {
      workOrderId,
      subtaskId,
      requestedById,
      notApplicable: Boolean(notApplicable),
      status: notApplicable ? StockWithdrawalStatus.APROVADA : StockWithdrawalStatus.PENDENTE,
      reviewedAt: notApplicable ? new Date() : null,
      items: { create: items.map((item) => ({ partId: item.partId, quantity: item.quantity })) },
    },
  });
}

export function listPending() {
  return prisma.stockWithdrawalRequest.findMany({
    where: { status: StockWithdrawalStatus.PENDENTE },
    include: stockWithdrawalInclude,
    orderBy: { createdAt: "asc" },
  });
}

export async function reviewStockWithdrawalRequest(
  id: string,
  input: ReviewStockWithdrawalInput,
  user: AuthPayload
) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.stockWithdrawalRequest.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!request) {
      throw new AppError(404, "STOCK_WITHDRAWAL_NOT_FOUND", "Solicitação de baixa não encontrada.");
    }
    if (request.status !== StockWithdrawalStatus.PENDENTE) {
      throw new AppError(409, "INVALID_TRANSITION", "Só é possível revisar solicitações pendentes.");
    }

    if (input.action === "APROVAR") {
      for (const item of request.items) {
        await recordStockMovement(tx, {
          partId: item.partId,
          type: "SAIDA",
          quantity: item.quantity,
          workOrderId: request.workOrderId,
          withdrawalRequestId: request.id,
          userId: user.userId,
          reason: `Baixa aprovada — solicitação ${request.id}`,
        });
        await tx.workOrderPart.create({
          data: { workOrderId: request.workOrderId, partId: item.partId, quantity: item.quantity },
        });
      }
    }

    return tx.stockWithdrawalRequest.update({
      where: { id },
      data: {
        status: input.action === "APROVAR" ? StockWithdrawalStatus.APROVADA : StockWithdrawalStatus.REJEITADA,
        reviewedById: user.userId,
        reviewedAt: new Date(),
        reviewNotes: input.reviewNotes,
      },
      include: stockWithdrawalInclude,
    });
  });
}
