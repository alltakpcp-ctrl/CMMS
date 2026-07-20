import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { Role } from "../src/domain/enums";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("senha123", 10);

  const users: Array<{ name: string; email: string; role: Role }> = [
    { name: "Operador Padrão", email: "operador@cmms.local", role: Role.OPERADOR },
    { name: "Técnico Padrão", email: "tecnico@cmms.local", role: Role.TECNICO },
    { name: "Supervisor Padrão", email: "supervisor@cmms.local", role: Role.SUPERVISOR },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: { ...user, passwordHash },
    });
  }

  const sectorNames = ["Mecânica", "Elétrica", "Predial"];
  const sectorsByName = new Map<string, Awaited<ReturnType<typeof prisma.sector.upsert>>>();
  for (const name of sectorNames) {
    const sector = await prisma.sector.upsert({ where: { name }, update: {}, create: { name } });
    sectorsByName.set(name, sector);
  }

  const assets: Array<{
    code: string;
    name: string;
    sectorName: string;
    location: string;
    criticality: number;
  }> = [
    { code: "AT-001", name: "Compressor de Ar 01", sectorName: "Mecânica", location: "Sala de Máquinas", criticality: 5 },
    { code: "AT-002", name: "Painel Elétrico Principal", sectorName: "Elétrica", location: "Subestação", criticality: 5 },
    { code: "AT-003", name: "Esteira Transportadora 03", sectorName: "Mecânica", location: "Linha 3", criticality: 3 },
    { code: "AT-004", name: "Sistema de Climatização", sectorName: "Predial", location: "Bloco Administrativo", criticality: 2 },
    { code: "AT-005", name: "Motor de Indução 15cv", sectorName: "Elétrica", location: "Linha 1", criticality: 4 },
    { code: "AT-006", name: "Portão Automático", sectorName: "Predial", location: "Entrada Principal", criticality: 1 },
  ];

  for (const { sectorName, ...asset } of assets) {
    await prisma.asset.upsert({
      where: { code: asset.code },
      update: {},
      create: { ...asset, sectorId: sectorsByName.get(sectorName)!.id },
    });
  }

  const parts: Array<{ code: string; description: string; unit: string; stockQty: number }> = [
    { code: "PC-001", description: "Rolamento 6205", unit: "un", stockQty: 20 },
    { code: "PC-002", description: "Correia V A-45", unit: "un", stockQty: 15 },
    { code: "PC-003", description: "Óleo lubrificante ISO 68", unit: "L", stockQty: 50 },
    { code: "PC-004", description: "Disjuntor tripolar 32A", unit: "un", stockQty: 10 },
    { code: "PC-005", description: "Cabo flexível 2,5mm²", unit: "m", stockQty: 200 },
    { code: "PC-006", description: "Filtro de ar comprimido", unit: "un", stockQty: 12 },
    { code: "PC-007", description: "Contator 3TF 40A", unit: "un", stockQty: 8 },
    { code: "PC-008", description: "Vedação de borracha", unit: "m", stockQty: 30 },
    { code: "PC-009", description: "Lâmpada LED 20W", unit: "un", stockQty: 40 },
    { code: "PC-010", description: "Graxa industrial", unit: "kg", stockQty: 25 },
  ];

  for (const part of parts) {
    await prisma.part.upsert({
      where: { code: part.code },
      update: {},
      create: part,
    });
  }

  console.log("Seed concluído: 3 usuários, 6 ativos, 10 peças.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
