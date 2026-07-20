import { Prisma, PrismaClient } from "@prisma/client";
import { AppError } from "./AppError";

type SectorLookupClient = PrismaClient | Prisma.TransactionClient;

export async function assertActiveSector(client: SectorLookupClient, sectorId: string) {
  const sector = await client.sector.findUnique({ where: { id: sectorId } });
  if (!sector || !sector.active) {
    throw new AppError(422, "INVALID_SECTOR", "Setor inválido ou inativo.");
  }
}
