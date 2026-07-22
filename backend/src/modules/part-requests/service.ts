import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../lib/AppError";
import { publicUserSelect } from "../../lib/publicUser";
import { PartRequestStatus } from "../../domain/enums";
import { AuthPayload } from "../../middlewares/authenticate";
import { CreatePartRequestInput } from "./schema";

export const partRequestInclude = {
  part: true,
  workOrder: { select: { id: true, number: true } },
  requestedBy: { select: publicUserSelect },
} satisfies Prisma.PartRequestInclude;

export async function createPartRequest(input: CreatePartRequestInput, user: AuthPayload) {
  if (input.partId) {
    const part = await prisma.part.findUnique({ where: { id: input.partId } });
    if (!part) {
      throw new AppError(404, "PART_NOT_FOUND", "Peça não encontrada.");
    }
  }

  if (input.osId) {
    const workOrder = await prisma.workOrder.findUnique({ where: { id: input.osId } });
    if (!workOrder) {
      throw new AppError(404, "WORK_ORDER_NOT_FOUND", "Ordem de serviço não encontrada.");
    }
  }

  return prisma.partRequest.create({
    data: {
      itemType: input.itemType,
      partId: input.partId,
      description: input.description,
      quantity: input.quantity,
      notes: input.notes,
      osId: input.osId,
      requestedById: user.userId,
      status: PartRequestStatus.PENDENTE,
    },
    include: partRequestInclude,
  });
}

export function listPending() {
  return prisma.partRequest.findMany({
    where: { status: { in: [PartRequestStatus.PENDENTE, PartRequestStatus.DEVOLVIDA] } },
    include: partRequestInclude,
    orderBy: { createdAt: "asc" },
  });
}

export function listMine(userId: string) {
  return prisma.partRequest.findMany({
    where: { requestedById: userId },
    include: partRequestInclude,
    orderBy: { createdAt: "desc" },
  });
}

export async function getPartRequestById(id: string) {
  const partRequest = await prisma.partRequest.findUnique({ where: { id }, include: partRequestInclude });
  if (!partRequest) {
    throw new AppError(404, "PART_REQUEST_NOT_FOUND", "Indicação de peça/ferramenta não encontrada.");
  }
  return partRequest;
}
