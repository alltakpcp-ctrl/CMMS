import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../lib/AppError";
import { publicUserSelect } from "../../lib/publicUser";
import { generatePurchaseOrderNumber } from "../../lib/purchaseOrderNumber";
import { PartRequestItemType, PartRequestStatus, PurchaseOrderStatus } from "../../domain/enums";
import { AuthPayload } from "../../middlewares/authenticate";
import { partRequestInclude } from "../part-requests/service";
import { CreatePurchaseOrderInput, RejectPartRequestInput, ReviewPurchaseOrderInput } from "./schema";

const purchaseOrderInclude = {
  createdBy: { select: publicUserSelect },
  reviewedBy: { select: publicUserSelect },
  items: { include: partRequestInclude },
  children: { select: { id: true, number: true } },
} satisfies Prisma.PurchaseOrderInclude;

export async function createPurchaseOrder(input: CreatePurchaseOrderInput, user: AuthPayload) {
  return prisma.$transaction(async (tx) => {
    const partIds = [...new Set(input.items.map((item) => item.partId))];
    const parts = await tx.part.findMany({ where: { id: { in: partIds } } });

    if (parts.length !== partIds.length) {
      throw new AppError(404, "PART_NOT_FOUND", "Uma ou mais peças não foram encontradas.");
    }

    const partsById = new Map(parts.map((part) => [part.id, part]));

    const number = await generatePurchaseOrderNumber(tx);

    const purchaseOrder = await tx.purchaseOrder.create({
      data: {
        number,
        status: PurchaseOrderStatus.EM_ANALISE,
        createdById: user.userId,
      },
    });

    for (const item of input.items) {
      const part = partsById.get(item.partId)!;
      await tx.partRequest.create({
        data: {
          itemType: PartRequestItemType.PECA,
          partId: item.partId,
          description: part.description,
          quantity: item.quantity,
          notes: null,
          osId: null,
          requestedById: user.userId,
          status: PartRequestStatus.INCLUIDA,
          purchaseOrderId: purchaseOrder.id,
        },
      });
    }

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
    where: { status: PurchaseOrderStatus.EM_ANALISE },
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
    if (purchaseOrder.status !== PurchaseOrderStatus.EM_ANALISE) {
      throw new AppError(409, "INVALID_TRANSITION", "Só é possível revisar pedidos em análise.");
    }

    if (input.action === "DEVOLVER") {
      // Indicações voltam para DEVOLVIDA (não PENDENTE) — mantêm o
      // purchaseOrderId deste pedido devolvido para rastreabilidade, mas
      // ficam elegíveis para entrar em um novo pedido (ver listPending/create).
      await tx.partRequest.updateMany({
        where: { purchaseOrderId: id },
        data: { status: PartRequestStatus.DEVOLVIDA },
      });

      await tx.purchaseOrder.update({
        where: { id },
        data: {
          status: PurchaseOrderStatus.DEVOLVIDO,
          reviewedById: user.userId,
          reviewedAt: new Date(),
          reviewNotes: input.reviewNotes,
        },
      });

      return tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: purchaseOrderInclude });
    }

    // action === "APROVAR"
    const itemsById = new Map(purchaseOrder.items.map((item) => [item.id, item]));
    const decisions = input.items ?? [];
    const decisionsById = new Map(decisions.map((decision) => [decision.itemId, decision]));

    for (const decision of decisions) {
      const item = itemsById.get(decision.itemId);
      if (!item) {
        throw new AppError(422, "ITEM_NOT_IN_ORDER", `Item ${decision.itemId} não pertence a este pedido.`);
      }
      if (decision.approvedQuantity + decision.deferredQuantity > item.quantity) {
        throw new AppError(
          422,
          "QUANTITY_EXCEEDS_REQUESTED",
          `Aprovado + postergado excede o solicitado no item ${decision.itemId}.`
        );
      }
    }

    for (const item of purchaseOrder.items) {
      if (!decisionsById.has(item.id)) {
        throw new AppError(422, "MISSING_ITEM_DECISION", `Decisão ausente para o item ${item.id}.`);
      }
    }

    const totalApproved = decisions.reduce((sum, decision) => sum + decision.approvedQuantity, 0);
    const totalDeferred = decisions.reduce((sum, decision) => sum + decision.deferredQuantity, 0);

    if (totalApproved === 0) {
      throw new AppError(
        422,
        "NOTHING_APPROVED",
        "Nenhum item aprovado. Use Devolver se não pretende aprovar nada."
      );
    }

    for (const decision of decisions) {
      if (decision.approvedQuantity > 0) {
        await tx.partRequest.update({
          where: { id: decision.itemId },
          data: { quantity: decision.approvedQuantity, status: PartRequestStatus.ATENDIDA },
        });
      } else if (decision.deferredQuantity > 0) {
        // Não atendido neste pedido — a sobra é rastreada só pelo clone no
        // pedido-filho (ver bloco abaixo); a quantity original não é alterada.
        await tx.partRequest.update({
          where: { id: decision.itemId },
          data: { status: PartRequestStatus.DEVOLVIDA },
        });
      }
    }

    if (totalDeferred > 0) {
      const childNumber = await generatePurchaseOrderNumber(tx);
      const child = await tx.purchaseOrder.create({
        data: {
          number: childNumber,
          status: PurchaseOrderStatus.EM_ANALISE,
          createdById: user.userId,
          parentPurchaseOrderId: id,
        },
      });

      for (const decision of decisions) {
        if (decision.deferredQuantity <= 0) continue;
        const original = itemsById.get(decision.itemId)!;
        await tx.partRequest.create({
          data: {
            itemType: original.itemType,
            partId: original.partId,
            description: original.description,
            quantity: decision.deferredQuantity,
            notes: original.notes,
            osId: original.osId,
            requestedById: original.requestedById,
            status: PartRequestStatus.INCLUIDA,
            purchaseOrderId: child.id,
          },
        });
      }
    }

    await tx.purchaseOrder.update({
      where: { id },
      data: {
        status: PurchaseOrderStatus.ENVIADO_COMPRAS,
        reviewedById: user.userId,
        reviewedAt: new Date(),
        reviewNotes: input.reviewNotes,
      },
    });

    return tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: purchaseOrderInclude });
  });
}

export async function closePurchaseOrder(id: string, user: AuthPayload) {
  return prisma.$transaction(async (tx) => {
    const purchaseOrder = await tx.purchaseOrder.findUnique({ where: { id } });
    if (!purchaseOrder) {
      throw new AppError(404, "PURCHASE_ORDER_NOT_FOUND", "Pedido de compra não encontrado.");
    }
    if (
      purchaseOrder.status !== PurchaseOrderStatus.APROVADO &&
      purchaseOrder.status !== PurchaseOrderStatus.APROVADO_PARCIAL
    ) {
      throw new AppError(409, "INVALID_TRANSITION", "Só pedidos aprovados podem ser enviados a compras.");
    }

    await tx.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.ENVIADO_COMPRAS },
    });

    return tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: purchaseOrderInclude });
  });
}

export function listForPurchasing() {
  return prisma.purchaseOrder.findMany({
    where: { status: PurchaseOrderStatus.ENVIADO_COMPRAS },
    include: purchaseOrderInclude,
    orderBy: { reviewedAt: "desc" },
  });
}
