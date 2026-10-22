// Reconstrói APROXIMADAMENTE o StatusHistory que nem o dump do cutover
// (restore-status-history.ts) conseguiu devolver — o intervalo 18/08–17/09/2026
// do incidente. Regras em src/lib/statusHistoryReconstruction.ts; toda linha
// gerada leva "[RECONSTRUÍDO]" na nota.
//
//   npx ts-node scripts/reconstruct-status-history.ts                   (dry-run + prévia CSV)
//   npx ts-node scripts/reconstruct-status-history.ts --apply           (grava)
//   ... --autor=email@empresa   usuário atribuído quando o autor real é
//                               desconhecido (padrão: manutencao@alltak.com.br)
//
// Rodar DEPOIS do restore-status-history.ts. Idempotente: os ids são
// determinísticos (recon_<osId>_<n>) e, depois de aplicado, as cadeias ficam
// sem buracos — rodar de novo não gera nada. O --apply grava os ids inseridos
// em reconstruct-status-history.<data>.json para um eventual rollback.
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { reconstructStatusHistory } from "../src/lib/statusHistoryReconstruction";

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const authorEmail = args.find((a) => a.startsWith("--autor="))?.slice("--autor=".length) ?? "manutencao@alltak.com.br";

  const prisma = new PrismaClient();
  try {
    const fallback = await prisma.user.findUnique({ where: { email: authorEmail }, select: { id: true, name: true } });
    if (!fallback) {
      const supervisors = await prisma.user.findMany({
        where: { role: "SUPERVISOR", active: true },
        select: { name: true, email: true },
        orderBy: { name: "asc" },
      });
      console.error(`Usuário de fallback ${authorEmail} não encontrado. Informe um com --autor=<email>. Supervisores ativos:`);
      supervisors.forEach((s) => console.error(`  ${s.email}  (${s.name})`));
      process.exitCode = 1;
      return;
    }

    // Instante da perda = primeira linha que sobreviveu depois do fim do dump
    // do cutover (18/08 ~16h UTC). Tudo que faltar aconteceu antes dele.
    const survivor = await prisma.statusHistory.findFirst({
      where: { changedAt: { gt: new Date("2026-08-18T18:00:00Z") }, id: { not: { startsWith: "recon_" } } },
      orderBy: { changedAt: "asc" },
      select: { changedAt: true },
    });
    const lostBefore = survivor?.changedAt;
    console.log(`Transições reconstruídas limitadas a antes de ${lostBefore?.toISOString() ?? "(sem limite)"}.`);

    const workOrders = await prisma.workOrder.findMany({
      orderBy: { number: "asc" },
      include: {
        statusHistory: { select: { fromStatus: true, toStatus: true, changedAt: true, note: true } },
        executions: { select: { startedAt: true, finishedAt: true, startedById: true, endedById: true } },
      },
    });

    const rows: Array<{ number: string; data: ReturnType<typeof reconstructStatusHistory>[number] & { id: string; workOrderId: string } }> = [];
    for (const wo of workOrders) {
      const entries = reconstructStatusHistory(wo, wo.statusHistory, wo.executions, fallback.id, lostBefore);
      entries.forEach((entry, i) =>
        rows.push({ number: wo.number, data: { ...entry, id: `recon_${wo.id}_${i + 1}`, workOrderId: wo.id } })
      );
    }

    const byStatus = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.data.toStatus] = (acc[r.data.toStatus] ?? 0) + 1;
      return acc;
    }, {});
    console.log({
      osNoBanco: workOrders.length,
      osComBuraco: new Set(rows.map((r) => r.number)).size,
      linhasAGerar: rows.length,
      comAutorReal: rows.filter((r) => r.data.changedById !== fallback.id).length,
      comAutorFallback: `${rows.filter((r) => r.data.changedById === fallback.id).length} (${fallback.name})`,
      porStatusDestino: byStatus,
    });

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const preview = `reconstruct-status-history.previa.${stamp}.csv`;
    fs.writeFileSync(
      preview,
      "﻿OS;de;para;quando (UTC);autor;nota\n" +
        rows
          .map((r) =>
            [r.number, r.data.fromStatus, r.data.toStatus, r.data.changedAt.toISOString(), r.data.changedById, r.data.note]
              .map(csvCell)
              .join(";")
          )
          .join("\n")
    );
    console.log(`Prévia linha a linha em ${preview}.`);

    if (!apply) {
      console.log("\nDry-run: nada foi gravado. Rode com --apply para inserir.");
      return;
    }

    const result = await prisma.statusHistory.createMany({ data: rows.map((r) => r.data), skipDuplicates: true });
    const logFile = `reconstruct-status-history.${stamp}.json`;
    fs.writeFileSync(logFile, JSON.stringify({ insertedIds: rows.map((r) => r.data.id), count: result.count }, null, 1));
    console.log(`\nInseridas ${result.count} linhas. Ids gravados em ${logFile}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("FALHA:", e);
  process.exit(1);
});
