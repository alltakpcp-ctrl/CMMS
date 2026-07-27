import { prisma } from "../../config/prisma";
import { AppError } from "../../lib/AppError";
import { CreateSectorInput, UpdateSectorInput } from "./schema";

export function listActiveSectors() {
  return prisma.sector.findMany({ where: { active: true }, orderBy: { name: "asc" } });
}

export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function assertNameAvailable(name: string, excludingId?: string) {
  const normalized = normalizeName(name);
  const sectors = await prisma.sector.findMany({ select: { id: true, name: true } });
  const collision = sectors.some(
    (sector) => sector.id !== excludingId && normalizeName(sector.name) === normalized,
  );
  if (collision) {
    throw new AppError(409, "SECTOR_NAME_EXISTS", "Já existe um setor com este nome.");
  }
}

async function getSectorById(id: string) {
  const sector = await prisma.sector.findUnique({ where: { id } });
  if (!sector) {
    throw new AppError(404, "SECTOR_NOT_FOUND", "Setor não encontrado.");
  }
  return sector;
}

export async function createSector(input: CreateSectorInput) {
  await assertNameAvailable(input.name);
  return prisma.sector.create({ data: { name: input.name } });
}

export async function updateSector(id: string, input: UpdateSectorInput) {
  const existing = await getSectorById(id);
  if (input.name !== undefined && normalizeName(input.name) !== normalizeName(existing.name)) {
    await assertNameAvailable(input.name, id);
  }

  return prisma.sector.update({
    where: { id },
    data: { name: input.name, active: input.active },
  });
}

export async function deleteSector(id: string) {
  await getSectorById(id);

  const [assets, assetSectors, workOrders, users] = await Promise.all([
    prisma.asset.count({ where: { sectorId: id } }),
    prisma.assetSector.count({ where: { sectorId: id } }),
    prisma.workOrder.count({ where: { targetSectorId: id } }),
    prisma.user.count({ where: { sectorId: id } }),
  ]);

  const hasHistory = assets > 0 || assetSectors > 0 || workOrders > 0 || users > 0;
  if (hasHistory) {
    throw new AppError(
      409,
      "SECTOR_HAS_HISTORY",
      "Setor possui registros vinculados. Desative-o em vez de excluir.",
    );
  }

  await prisma.sector.delete({ where: { id } });
}
