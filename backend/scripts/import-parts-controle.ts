import dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import path from "path";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

interface ControleRow {
  code: string;
  description: string;
  stockQty: number;
  minStock: number | null;
  maxStock: number | null;
  location: string | null;
}

function parseIntOrNull(raw: unknown): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

function parseLocation(armario: unknown, prateleira: unknown): string | null {
  const a = String(armario ?? "").trim();
  const p = String(prateleira ?? "").trim();
  if (!a && !p) return null;
  if (a && !p) return `Armário ${a}`;
  if (!a && p) return `Prateleira ${p}`;
  return `Armário ${a}, Prateleira ${p}`;
}

function readControleRows(): {
  rows: ControleRow[];
  totalRead: number;
  skippedNoCode: number;
  skippedSaldoZeroOrLess: number;
} {
  const filePath = path.join(__dirname, "parts.xlsx");
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets["CONTROLE"];
  if (!sheet) throw new Error('Aba "CONTROLE" não encontrada.');

  const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  if (raw.length > 0) {
    const keys = Object.keys(raw[0]);
    const required = ["CÓDIGO", "DESCRIÇÃO", "QTD. ATUAL"];
    for (const k of required) {
      if (!keys.includes(k)) {
        throw new Error(`Cabeçalho esperado "${k}" não encontrado. Colunas lidas: ${keys.join(", ")}`);
      }
    }
  }

  const rows: ControleRow[] = [];
  let skippedNoCode = 0;
  let skippedSaldoZeroOrLess = 0;

  for (const r of raw) {
    const code = String(r["CÓDIGO"] ?? "").trim();
    if (!code) {
      skippedNoCode++;
      continue;
    }

    const stockQty = parseIntOrNull(r["QTD. ATUAL"]);
    if (stockQty === null || stockQty <= 0) {
      skippedSaldoZeroOrLess++;
      continue;
    }

    rows.push({
      code,
      description: String(r["DESCRIÇÃO"] ?? "").trim(),
      stockQty,
      minStock: parseIntOrNull(r["MÍNIMO"]),
      maxStock: parseIntOrNull(r["MÁXIMO"]),
      location: parseLocation(r["ARMARIO"], r["PRATELEIRA"]),
    });
  }

  return { rows, totalRead: raw.length, skippedNoCode, skippedSaldoZeroOrLess };
}

interface PlannedUpdate {
  id: string;
  code: string;
  stockQtyBefore: number;
  stockQtyAfter: number;
}

interface PlannedCreate {
  code: string;
  description: string;
  stockQty: number;
  minStock: number | null;
  maxStock: number | null;
  location: string | null;
}

async function main() {
  const { rows, totalRead, skippedNoCode, skippedSaldoZeroOrLess } = readControleRows();

  const seen = new Map<string, number>();
  for (const r of rows) {
    seen.set(r.code, (seen.get(r.code) ?? 0) + 1);
  }
  const dups = [...seen.entries()].filter(([, c]) => c > 1).map(([code]) => code);
  if (dups.length > 0) {
    console.error(`ABORTADO: códigos duplicados na aba CONTROLE (${dups.length}):`);
    console.error(dups.join(", "));
    process.exitCode = 1;
    return;
  }

  const existingParts = await prisma.part.findMany({ select: { id: true, code: true, stockQty: true } });
  const existingByCode = new Map(existingParts.map((p) => [p.code, p]));

  const plannedUpdates: PlannedUpdate[] = [];
  const plannedCreates: PlannedCreate[] = [];

  for (const row of rows) {
    const existing = existingByCode.get(row.code);
    if (existing) {
      plannedUpdates.push({
        id: existing.id,
        code: row.code,
        stockQtyBefore: existing.stockQty,
        stockQtyAfter: row.stockQty,
      });
    } else {
      plannedCreates.push({
        code: row.code,
        description: row.description,
        stockQty: row.stockQty,
        minStock: row.minStock,
        maxStock: row.maxStock,
        location: row.location,
      });
    }
  }

  console.log(`=== Importação aba CONTROLE (${APPLY ? "APLICAR" : "DRY-RUN"}) ===`);
  console.log(`Total de linhas lidas: ${totalRead}`);
  console.log(`Linhas sem CÓDIGO (ignoradas): ${skippedNoCode}`);
  console.log(`Linhas com saldo <= 0 ou inválido (ignoradas): ${skippedSaldoZeroOrLess}`);
  console.log(`Linhas válidas (saldo > 0): ${rows.length}`);
  console.log(`Peças existentes que terão o saldo substituído: ${plannedUpdates.length}`);
  console.log(`Peças novas a criar: ${plannedCreates.length}`);

  console.log(`\n--- Amostra de até 10 atualizações de saldo ---`);
  for (const u of plannedUpdates.slice(0, 10)) {
    console.log(`${u.code}: stockQty ${u.stockQtyBefore} -> ${u.stockQtyAfter}`);
  }

  console.log(`\n--- Amostra de até 10 criações ---`);
  for (const c of plannedCreates.slice(0, 10)) {
    console.log(
      `${c.code}: "${c.description}" | stockQty=${c.stockQty} | minStock=${c.minStock ?? "null"} | ` +
        `maxStock=${c.maxStock ?? "null"} | location=${c.location ?? "null"}`
    );
  }

  if (!APPLY) {
    console.log("\nDRY-RUN: nenhuma escrita foi feita no banco. Rode com --apply para gravar.");
    return;
  }

  // Gravações sequenciais e independentes (sem transação única amarrando as 601
  // operações): o endpoint do Neon usado aqui é o "-pooler" (PgBouncer), que pode
  // reciclar a conexão física no meio de uma transação interativa do Prisma e
  // derrubá-la com "Transaction API error: Transaction not found" (P2028). Como
  // o script é idempotente (recalcula o diff a cada execução a partir do estado
  // atual do banco), uma falha pontual em uma linha não compromete as demais nem
  // exige rollback manual — basta rodar de novo.
  let updateFailures = 0;
  let createFailures = 0;

  for (const u of plannedUpdates) {
    try {
      await prisma.part.update({ where: { id: u.id }, data: { stockQty: u.stockQtyAfter } });
    } catch (e) {
      updateFailures++;
      console.error(`Falha ao atualizar saldo de ${u.code}:`, e);
    }
  }

  for (const c of plannedCreates) {
    try {
      await prisma.part.create({
        data: {
          code: c.code,
          description: c.description,
          unit: "",
          stockQty: c.stockQty,
          minStock: c.minStock,
          maxStock: c.maxStock,
          location: c.location,
        },
      });
    } catch (e) {
      createFailures++;
      console.error(`Falha ao criar peça ${c.code}:`, e);
    }
  }

  console.log(
    `\nAPLICADO: ${plannedUpdates.length - updateFailures}/${plannedUpdates.length} peças com saldo substituído, ` +
      `${plannedCreates.length - createFailures}/${plannedCreates.length} peças criadas.`
  );
  if (updateFailures > 0 || createFailures > 0) {
    console.log("Houve falhas pontuais — rode o script novamente para tentar aplicar o restante.");
    process.exitCode = 1;
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
