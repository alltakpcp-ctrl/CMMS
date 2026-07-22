import dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import path from "path";

const prisma = new PrismaClient();

interface Row {
  code: string;
  description: string;
}

function readRows(): { rows: Row[]; totalRead: number; skipped: number } {
  const filePath = path.join(__dirname, "parts.xlsx");
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets["Planilha1"];
  if (!sheet) throw new Error('Aba "Planilha1" não encontrada.');

  const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  if (raw.length > 0) {
    const keys = Object.keys(raw[0]);
    if (!keys.includes("CÓDIGO") || !keys.includes("DESCRIÇÃO")) {
      throw new Error(`Cabeçalhos esperados não encontrados. Colunas lidas: ${keys.join(", ")}`);
    }
  }

  const rows: Row[] = [];
  let skipped = 0;

  for (const r of raw) {
    const code = String(r["CÓDIGO"] ?? "").trim();
    const description = String(r["DESCRIÇÃO"] ?? "").trim();
    if (!code || !description) {
      skipped++;
      continue;
    }
    rows.push({ code, description });
  }

  return { rows, totalRead: raw.length, skipped };
}

async function main() {
  const { rows, totalRead, skipped } = readRows();

  const seen = new Map<string, number>();
  for (const r of rows) {
    seen.set(r.code, (seen.get(r.code) ?? 0) + 1);
  }
  const dups = [...seen.entries()].filter(([, c]) => c > 1).map(([code]) => code);
  if (dups.length > 0) {
    console.error(`ABORTADO: códigos duplicados na planilha (${dups.length}):`);
    console.error(dups.join(", "));
    process.exitCode = 1;
    return;
  }

  const sheetCodes = new Set(rows.map((r) => r.code));

  let created = 0;
  let updated = 0;
  let deleted = 0;
  const keptDueToUse: string[] = [];

  await prisma.$transaction(
    async (tx) => {
      const existingParts = await tx.part.findMany({ select: { id: true, code: true } });
      const existingByCode = new Map(existingParts.map((p) => [p.code, p]));

      const usedPartIds = new Set(
        (await tx.workOrderPart.findMany({ select: { partId: true } })).map((w) => w.partId)
      );

      for (const row of rows) {
        const existing = existingByCode.get(row.code);
        if (existing) {
          await tx.part.update({
            where: { id: existing.id },
            data: { description: row.description, unit: "", stockQty: 0 },
          });
          updated++;
        } else {
          await tx.part.create({
            data: { code: row.code, description: row.description, unit: "", stockQty: 0 },
          });
          created++;
        }
      }

      for (const p of existingParts) {
        if (sheetCodes.has(p.code)) continue;
        if (usedPartIds.has(p.id)) {
          keptDueToUse.push(p.code);
          continue;
        }
        await tx.part.delete({ where: { id: p.id } });
        deleted++;
      }
    },
    { timeout: 120000 }
  );

  console.log("=== Relatório de importação de peças ===");
  console.log(`Total de linhas lidas na planilha: ${totalRead}`);
  console.log(`Linhas válidas: ${rows.length}`);
  console.log(`Linhas puladas (code/description vazio): ${skipped}`);
  console.log(`Peças criadas: ${created}`);
  console.log(`Peças atualizadas: ${updated}`);
  console.log(`Peças deletadas: ${deleted}`);
  if (keptDueToUse.length > 0) {
    console.log(`Peças mantidas por uso em OS (${keptDueToUse.length}):`);
    console.log(keptDueToUse.join(", "));
  } else {
    console.log("Nenhuma peça mantida por uso em OS.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
