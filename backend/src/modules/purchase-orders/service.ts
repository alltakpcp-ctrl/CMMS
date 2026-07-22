import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../lib/AppError";
import { publicUserSelect } from "../../lib/publicUser";
import { generatePurchaseOrderNumber } from "../../lib/purchaseOrderNumber";
import { PartRequestStatus, PurchaseOrderStatus } from "../../domain/enums";
import { AuthPayload } from "../../middlewares/authenticate";
import { partRequestInclude } from "../part-requests/service";
import { CreatePurchaseOrderInput, RejectPartRequestInput, ReviewPurchaseOrderInput } from "./schema";

const purchaseOrderInclude = {
  createdBy: { select: publicUserSelect },
  reviewedBy: { select: publicUserSelect },
  items: { include: partRequestInclude },
} satisfies Prisma.PurchaseOrderInclude;

export async function createPurchaseOrder(input: CreatePurchaseOrderInput, user: AuthPayload) {
  return prisma.$transaction(async (tx) => {
    const partRequests = await tx.partRequest.findMany({
      where: { id: { in: input.partRequestIds } },
    });

    if (partRequests.length !== input.partRequestIds.length) {
      throw new AppError(404, "PART_REQUEST_NOT_FOUND", "Uma ou mais indicações não foram encontradas.");
    }

    const notEligible = partRequests.find(
      (partRequest) =>
        partRequest.status !== PartRequestStatus.PENDENTE && partRequest.status !== PartRequestStatus.DEVOLVIDA
    );
    if (notEligible) {
      throw new AppError(
        409,
        "INVALID_PART_REQUEST_STATUS",
        `Indicação ${notEligible.id} não está PENDENTE nem DEVOLVIDA.`
      );
    }

    const number = await generatePurchaseOrderNumber(tx);

    const purchaseOrder = await tx.purchaseOrder.create({
      data: {
        number,
        status: PurchaseOrderStatus.ENVIADO,
        createdById: user.userId,
      },
    });

    await tx.partRequest.updateMany({
      where: { id: { in: input.partRequestIds } },
      data: { purchaseOrderId: purchaseOrder.id, status: PartRequestStatus.INCLUIDA },
    });

    return tx.purchaseOrder.findUniqueOrThrow({
      where: { id: purchaseOrder.id },
      include: purchaseOrderInclude,
    });
  });
}

export async function rejectPartRequest(id: string, input: RejectPartRequestInput) {
  const partRequest = await prisma.partRequest.findUnique({ where: { id } });
  if (!partRequest) {
    throw new AppError(404, "PART_REQUEST_NOT_FOUND", "Indicação de peça/ferramenta não encontrada.");
  }
  if (partRequest.status !== PartRequestStatus.PENDENTE) {
    throw new AppError(409, "INVALID_PART_REQUEST_STATUS", "Só é possível rejeitar indicações PENDENTES.");
  }

  return prisma.partRequest.update({
    where: { id },
    data: { status: PartRequestStatus.REJEITADA, rejectedReason: input.rejectedReason },
    include: partRequestInclude,
  });
}

export function listForSupervisor() {
  return prisma.purchaseOrder.findMany({
    where: { status: PurchaseOrderStatus.ENVIADO },
    include: purchaseOrderInclude,
    orderBy: { createdAt: "asc" },
  });
}

export async function getPurchaseOrderById(id: string) {
  const purchaseOrder = await prisma.purchaseOrder.findUnique({ where: { id }, include: purchaseOrderInclude });
  if (!purchaseOrder) {
    throw new AppError(404, "PURCHASE_ORDER_NOT_FOUND", "Pedido de compra não encontrado.");
  }
  return purchaseOrder;
}

export async function reviewPurchaseOrder(id: string, input: ReviewPurchaseOrderInput, user: AuthPayload) {
  return prisma.$transaction(async (tx) => {
    const purchaseOrder = await tx.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
    if (!purchaseOrder) {
      throw new AppError(404, "PURCHASE_ORDER_NOT_FOUND", "Pedido de compra não encontrado.");
    }
    if (purchaseOrder.status !== PurchaseOrderStatus.ENVIADO) {
      throw new AppError(409, "INVALID_TRANSITION", "Só é possível revisar pedidos com status ENVIADO.");
    }

    for (const item of input.items ?? []) {
      const belongsToOrder = purchaseOrder.items.some((partRequest) => partRequest.id === item.itemId);
      if (!belongsToOrder) {
        throw new AppError(422, "ITEM_NOT_IN_ORDER", `Item ${item.itemId} não pertence a este pedido.`);
      }
      await tx.partRequest.update({ where: { id: item.itemId }, data: { quantity: item.quantity } });
    }

    if (input.action === "REJEITAR") {
      // Indicações voltam para DEVOLVIDA (não PENDENTE) — mantêm o
      // purchaseOrderId deste pedido rejeitado para rastreabilidade, mas
      // ficam elegíveis para entrar em um novo pedido (ver listPending/create).
      await tx.partRequest.updateMany({
        where: { purchaseOrderId: id },
        data: { status: PartRequestStatus.DEVOLVIDA },
      });
    } else {
      // ATENDIDA é terminal: mantém o purchaseOrderId, mas não volta pra fila
      // nem pode entrar em novo pedido (ver listPending/create).
      await tx.partRequest.updateMany({
        where: { purchaseOrderId: id },
        data: { status: PartRequestStatus.ATENDIDA },
      });
    }

    await tx.purchaseOrder.update({
      where: { id },
      data: {
        status: input.action === "APROVAR" ? PurchaseOrderStatus.APROVADO : PurchaseOrderStatus.REJEITADO,
        reviewedById: user.userId,
        reviewedAt: new Date(),
        reviewNotes: input.reviewNotes,
      },
    });

    return tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: purchaseOrderInclude });
  });
}
