import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../lib/AppError";
import { assertActiveSector } from "../../lib/sectors";
import { AuthPayload } from "../../middlewares/authenticate";
import { Role } from "../../domain/enums";
import { CreateAssetInput, UpdateAssetInput } from "./schema";

const assetInclude = {
  sector: true,
  sectors: { include: { sector: true } },
} satisfies Prisma.AssetInclude;

export async function listAssets(user: AuthPayload) {
  if (user.role === Role.OPERADOR) {
    const operador = await prisma.user.findUnique({ where: { id: user.userId }, select: { sectorId: true } });
    if (!operador?.sectorId) {
      return [];
    }
    return prisma.asset.findMany({
      where: { sectors: { some: { sectorId: operador.sectorId } } },
      orderBy: { code: "asc" },
      include: assetInclude,
    });
  }
  return prisma.asset.findMany({ orderBy: { code: "asc" }, include: assetInclude });
}

export async function getAssetById(id: string) {
  const asset = await prisma.asset.findUnique({ where: { id }, include: assetInclude });
  if (!asset) {
    throw new AppError(404, "ASSET_NOT_FOUND", "Ativo não encontrado.");
  }
  return asset;
}

export async function createAsset(input: CreateAssetInput) {
  for (const sectorId of input.sectorIds) {
    await assertActiveSector(prisma, sectorId);
  }
  const [primarySectorId] = input.sectorIds;

  return prisma.$transaction(async (tx) => {
    const asset = await tx.asset.create({
      data: {
        code: input.code,
        name: input.name,
        sectorId: primarySectorId,
        location: input.location,
        criticality: input.criticality,
        preventivePeriodicityDays: input.preventivePeriodicityDays,
      },
    });
    await tx.assetSector.createMany({
      data: input.sectorIds.map((sectorId) => ({ assetId: asset.id, sectorId })),
      skipDuplicates: true,
    });
    return tx.asset.findUniqueOrThrow({ where: { id: asset.id }, include: assetInclude });
  });
}

export async function updateAsset(id: string, input: UpdateAssetInput) {
  await getAssetById(id);
  const { sectorIds, ...rest } = input;
  if (sectorIds) {
    for (const sectorId of sectorIds) {
      await assertActiveSector(prisma, sectorId);
    }
  }

  return prisma.$transaction(async (tx) => {
    await tx.asset.update({
      where: { id },
      data: {
        ...rest,
        ...(sectorIds && { sectorId: sectorIds[0] }),
      },
    });
    if (sectorIds) {
      await tx.assetSector.deleteMany({ where: { assetId: id } });
      await tx.assetSector.createMany({
        data: sectorIds.map((sectorId) => ({ assetId: id, sectorId })),
        skipDuplicates: true,
      });
    }
    return tx.asset.findUniqueOrThrow({ where: { id }, include: assetInclude });
  });
}

export async function deleteAsset(id: string) {
  await getAssetById(id);
  await prisma.asset.delete({ where: { id } });
}
