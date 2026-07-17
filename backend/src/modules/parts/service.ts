import { prisma } from "../../config/prisma";
import { AppError } from "../../lib/AppError";
import { CreatePartInput, UpdatePartInput } from "./schema";

export function listParts() {
  return prisma.part.findMany({ orderBy: { code: "asc" } });
}

export async function getPartById(id: string) {
  const part = await prisma.part.findUnique({ where: { id } });
  if (!part) {
    throw new AppError(404, "PART_NOT_FOUND", "Peça não encontrada.");
  }
  return part;
}

export function createPart(input: CreatePartInput) {
  return prisma.part.create({ data: input });
}

export async function updatePart(id: string, input: UpdatePartInput) {
  await getPartById(id);
  return prisma.part.update({ where: { id }, data: input });
}

export async function deletePart(id: string) {
  await getPartById(id);
  await prisma.part.delete({ where: { id } });
}
