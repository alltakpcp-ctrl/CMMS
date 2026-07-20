import dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SECTOR_NAMES = [
  "Laminação",
  "Revisão",
  "Flexográfica",
  "Elsner",
  "ADM",
  "Estoque",
  "Expedição",
  "Almoxarifado",
  "Vestiários",
  "Refeitório",
  "Cozinha",
  "Portaria",
  "RH",
  "Sala CQ",
  "Sala Fórmula",
  "Estúdio",
  "Manutenção",
  "Galpão lonado",
  "Prédio Fabril",
  "Prédio ADM",
];

async function main() {
  const before = await prisma.sector.count();

  for (const name of SECTOR_NAMES) {
    await prisma.sector.upsert({ where: { name }, update: {}, create: { name } });
  }

  const after = await prisma.sector.count();
  console.log(`Seed de setores concluído. Criados: ${after - before}. Total na tabela: ${after}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
