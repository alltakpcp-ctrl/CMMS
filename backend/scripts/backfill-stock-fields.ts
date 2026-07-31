import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const CSV_PATH = path.join(__dirname, "..", "..", "TESTE - CONTROLE MANUTENÇÃO - CONTROLE.csv");

interface CsvRow {
  minStock: number | null;
  location: string | null;
}

interface CsvIndex {
  byCode: Map<string, CsvRow>;
  duplicateCodes: string[];
}

function parseMinStock(raw: string | undefined): number | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const n = parseInt(trimmed, 10);
  return Number.isNaN(n) ? null : n;
}

function parseLocation(armario: string | undefined, prateleira: string | undefined): string | null {
  const a = (armario ?? "").trim();
  const p = (prateleira ?? "").trim();
  if (!a && !p) return null;
  if (a && !p) return `Armário ${a}`;
  if (!a && p) return `Prateleira ${p}`;
  return `Armário ${a}, Prateleira ${p}`;
}

function readCsvIndex(): CsvIndex {
  const raw = fs.readFileSync(CSV_PATH, "utf-8");
  const records: Record<string, string>[] = parse(raw, {
    columns: true,
    skip_empty_lines: true,
  });

  const byCode = new Map<string, CsvRow>();
  const seenCount = new Map<string, number>();

  for (const record of records) {
    const code = (record["CÓDIGO"] ?? "").trim();
    if (!code) continue;

    seenCount.set(code, (seenCount.get(code) ?? 0) + 1);
    if (byCode.has(code)) continue; // primeira ocorrência vence

    byCode.set(code, {
      minStock: parseMinStock(record["MÍNIMO"]),
      location: parseLocation(record["ARMARIO"], record["PRATELEIRA"]),
    });
  }

  const duplicateCodes = [...seenCount.entries()].filter(([, c]) => c > 1).map(([code]) => code);

  return { byCode, duplicateCodes };
}

interface PlannedUpdate {
  id: string;
  code: string;
  minStockBefore: number | null;
  minStockAfter: number | null;
  locationBefore: string | null;
  locationAfter: string | null;
}

async function main() {
  const { byCode, duplicateCodes } = readCsvIndex();

  const parts = await prisma.part.findMany({
    select: { id: true, code: true, minStock: true, location: true },
  });

  let withMatch = 0;
  let withoutMatch = 0;
  let wouldSetMinStock = 0;
  let wouldSetLocation = 0;
  let noChange = 0;
  const planned: PlannedUpdate[] = [];

  for (const part of parts) {
    const csvRow = byCode.get(part.code);
    if (!csvRow) {
      withoutMatch++;
      continue;
    }
    withMatch++;

    const data: { minStock?: number; location?: string } = {};

    const setMinStock = part.minStock == null && csvRow.minStock != null;
    const setLocation = part.location == null && csvRow.location != null;

    if (setMinStock) {
      data.minStock = csvRow.minStock!;
      wouldSetMinStock++;
    }
    if (setLocation) {
      data.location = csvRow.location!;
      wouldSetLocation++;
    }

    if (!setMinStock && !setLocation) {
      noChange++;
      continue;
    }

    planned.push({
      id: part.id,
      code: part.code,
      minStockBefore: part.minStock,
      minStockAfter: setMinStock ? csvRow.minStock! : part.minStock,
      locationBefore: part.location,
      locationAfter: setLocation ? csvRow.location! : part.location,
    });
  }

  console.log(`=== Backfill minStock/location (${APPLY ? "APPLY" : "DRY-RUN"}) ===`);
  console.log(`Total de Part no banco: ${parts.length}`);
  console.log(`Com correspondência no CSV: ${withMatch}`);
  console.log(`Sem correspondência no CSV: ${withoutMatch}`);
  console.log(`Que receberiam minStock: ${wouldSetMinStock}`);
  console.log(`Que receberiam location: ${wouldSetLocation}`);
  console.log(`Que não mudariam (já preenchidos ou CSV sem dado): ${noChange}`);
  console.log(`Códigos duplicados no CSV: ${duplicateCodes.length}`);
  if (duplicateCodes.length > 0) {
    console.log(`  -> ${duplicateCodes.join(", ")}`);
  }

  console.log(`\n=== Amostra de até 10 updates ===`);
  for (const p of planned.slice(0, 10)) {
    console.log(
      `${p.code}: minStock ${p.minStockBefore ?? "null"} -> ${p.minStockAfter ?? "null"} | ` +
        `location ${p.locationBefore ?? "null"} -> ${p.locationAfter ?? "null"}`
    );
  }

  if (!APPLY) {
    console.log("\nDRY-RUN: nenhuma escrita foi feita no banco.");
    return;
  }

  await prisma.$transaction(
    planned.map((p) => {
      const data: { minStock?: number; location?: string } = {};
      if (p.minStockAfter !== p.minStockBefore) data.minStock = p.minStockAfter!;
      if (p.locationAfter !== p.locationBefore) data.location = p.locationAfter!;
      return prisma.part.update({ where: { id: p.id }, data });
    })
  );

  console.log(`\nAPLICADO: ${planned.length} Part atualizadas.`);
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
