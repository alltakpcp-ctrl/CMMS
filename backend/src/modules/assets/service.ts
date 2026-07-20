import { prisma } from "../../config/prisma";
import { AppError } from "../../lib/AppError";
import { assertActiveSector } from "../../lib/sectors";
import { CreateAssetInput, UpdateAssetInput } from "./schema";

export function listAssets() {
  return prisma.asset.findMany({ orderBy: { code: "asc" }, include: { sector: true } });
}

export async function getAssetById(id: string) {
  const asset = await prisma.asset.findUnique({ where: { id }, include: { sector: true } });
  if (!asset) {
    throw new AppError(404, "ASSET_NOT_FOUND", "Ativo não encontrado.");
  }
  return asset;
}

export async function createAsset(input: CreateAssetInput) {
  await assertActiveSector(prisma, input.sectorId);
  return prisma.asset.create({ data: input, include: { sector: true } });
}

export async function updateAsset(id: string, input: UpdateAssetInput) {
  await getAssetById(id);
  if (input.sectorId) {
    await assertActiveSector(prisma, input.sectorId);
  }
  return prisma.asset.update({ where: { id }, data: input, include: { sector: true } });
}

export async function deleteAsset(id: string) {
  await getAssetById(id);
  await prisma.asset.delete({ where: { id } });
}
