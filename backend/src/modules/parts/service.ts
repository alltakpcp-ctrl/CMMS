import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../lib/AppError";
import { effectiveStockStatus } from "../stock/schema";
import { CreatePartInput, UpdatePartInput } from "./schema";

export async function listParts() {
  const parts = await prisma.part.findMany({ orderBy: { code: "asc" } });
  return parts.map((p) => ({
    ...p,
    stockStatus: effectiveStockStatus(p.stockQty, p.minStock, p.maxStock, p.stockStatusOverride),
  }));
}

export async function getPartById(id: string) {
  const part = await prisma.part.findUnique({ where: { id } });
  if (!part) {
    throw new AppError(404, "PART_NOT_FOUND", "Peça não encontrada.");
  }
  return part;
}

export async function createPart(input: CreatePartInput) {
  try {
    return await prisma.part.create({ data: input });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(
        409,
        "PART_CODE_DUPLICATE",
        "Já existe uma peça cadastrada com este código."
      );
    }
    throw err;
  }
}

export async function updatePart(id: string, input: UpdatePartInput) {
  await getPartById(id);
  return prisma.part.update({ where: { id }, data: input });
}

export async function deletePart(id: string) {
  await getPartById(id);
  try {
    await prisma.part.delete({ where: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      throw new AppError(
        409,
        "PART_HAS_MOVEMENTS",
        "Peça possui histórico de movimentação e não pode ser excluída. Considere desativá-la (active=false)."
      );
    }
    throw err;
  }
}
