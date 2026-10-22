// Restaura linhas de StatusHistory a partir de um dump do pg_dump em formato
// custom (PGDMP) — usado no incidente de 2026-09-17, em que todo o histórico
// de status anterior a essa data sumiu de produção (Execution/ExecutionLog
// ficaram intactos). Fonte: dump do cutover de 2026-08-18.
//
//   npx ts-node scripts/restore-status-history.ts <arquivo.dump>           (dry-run)
//   npx ts-node scripts/restore-status-history.ts <arquivo.dump> --apply   (grava)
//
// Idempotente: reinsere com os ids ORIGINAIS e skipDuplicates, então rodar de
// novo não duplica nada. Linhas cuja OS ou usuário não existem mais no banco
// são puladas (e listadas). O --apply grava em restore-status-history.<data>.json
// os ids inseridos, para um eventual rollback por id.
import fs from "node:fs";
import zlib from "node:zlib";
import { PrismaClient } from "@prisma/client";

interface DumpRow {
  id: string;
  workOrderId: string;
  fromStatus: string | null;
  toStatus: string;
  changedById: string;
  note: string | null;
  changedAt: Date;
}

// Leitor mínimo do formato custom (pg_backup_archiver.c / pg_backup_custom.c):
// cabeçalho, TOC e o bloco de dados de UMA tabela (COPY em texto, zlib).
function readTableFromDump(file: string, table: string): string[][] {
  const buf = fs.readFileSync(file);
  let p = 0;
  if (buf.toString("latin1", 0, 5) !== "PGDMP") throw new Error("Arquivo não é um dump PGDMP.");
  p = 5;
  const [vmaj, vmin] = [buf[p++], buf[p++]];
  p++; // vrev
  const ver = vmaj * 100 + vmin;
  const intSize = buf[p++];
  const offSize = buf[p++];
  const format = buf[p++];
  if (format !== 1) throw new Error(`Formato ${format} não suportado (esperado custom).`);

  const readInt = () => {
    const sign = buf[p++];
    let v = 0;
    for (let i = 0; i < intSize; i++) v += buf[p++] * 2 ** (8 * i);
    return sign ? -v : v;
  };
  const readStr = () => {
    const n = readInt();
    if (n < 0) return null;
    const s = buf.toString("utf8", p, p + n);
    p += n;
    return s;
  };
  const readOffset = () => {
    p++; // flag
    let v = 0;
    for (let i = 0; i < offSize; i++) v += buf[p++] * 2 ** (8 * i);
    return v;
  };

  const compression = ver >= 115 ? buf[p++] : readInt();
  for (let i = 0; i < 7; i++) readInt(); // timestamp
  readStr(); // dbname
  readStr(); // versão do servidor
  readStr(); // versão do pg_dump
  const tocCount = readInt();

  let target: { dumpId: number; offset: number; columns: string[] } | null = null;
  for (let i = 0; i < tocCount; i++) {
    const dumpId = readInt();
    readInt(); // hadDumper
    readStr(); // tableoid
    readStr(); // oid
    const tag = readStr();
    const desc = readStr();
    readInt(); // section
    readStr(); // defn
    readStr(); // dropStmt
    const copyStmt = readStr();
    readStr(); // namespace
    readStr(); // tablespace
    if (ver >= 114) readStr(); // tableam
    if (ver >= 116) readInt(); // relkind
    readStr(); // owner
    readStr(); // withOids
    while (readStr() !== null); // deps
    const offset = readOffset();
    if (desc === "TABLE DATA" && tag === table && copyStmt) {
      const columns = copyStmt.match(/\(([^)]*)\)/)![1].replace(/"/g, "").split(", ");
      target = { dumpId, offset, columns };
    }
  }
  if (!target) throw new Error(`Tabela ${table} não encontrada no dump.`);

  p = target.offset;
  p++; // tipo do bloco
  if (readInt() !== target.dumpId) throw new Error("Bloco de dados não confere com o TOC.");
  const chunks: Buffer[] = [];
  for (;;) {
    const n = readInt();
    if (n === 0) break;
    chunks.push(buf.subarray(p, p + n));
    p += n;
  }
  const raw = Buffer.concat(chunks);
  const text = (compression ? zlib.inflateSync(raw) : raw).toString("utf8");

  const unescape = (v: string) =>
    v === "\\N"
      ? null
      : v.replace(/\\(.)/g, (_, c) => ({ t: "\t", n: "\n", r: "\r", "\\": "\\" } as Record<string, string>)[c] ?? c);

  const rows = text
    .split("\n")
    .filter((line) => line && line !== "\\.")
    .map((line) => line.split("\t").map(unescape) as string[]);
  return [target.columns, ...rows];
}

async function main() {
  const [file, flag] = process.argv.slice(2);
  if (!file) throw new Error("Informe o caminho do dump.");
  const apply = flag === "--apply";

  const [columns, ...raw] = readTableFromDump(file, "StatusHistory");
  const col = (name: string) => columns.indexOf(name);
  const rows: DumpRow[] = raw.map((r) => ({
    id: r[col("id")],
    workOrderId: r[col("workOrderId")],
    fromStatus: r[col("fromStatus")],
    toStatus: r[col("toStatus")],
    changedById: r[col("changedById")],
    note: r[col("note")],
    // timestamp(3) sem fuso — o Prisma grava em UTC
    changedAt: new Date(`${r[col("changedAt")].replace(" ", "T")}Z`),
  }));

  const prisma = new PrismaClient();
  try {
    const [existingIds, workOrders, users] = await Promise.all([
      prisma.statusHistory.findMany({ where: { id: { in: rows.map((r) => r.id) } }, select: { id: true } }),
      prisma.workOrder.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.workOrderId))] } },
        select: { id: true },
      }),
      prisma.user.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.changedById))] } },
        select: { id: true },
      }),
    ]);
    const existing = new Set(existingIds.map((r) => r.id));
    const woSet = new Set(workOrders.map((w) => w.id));
    const userSet = new Set(users.map((u) => u.id));

    const toInsert = rows.filter((r) => !existing.has(r.id) && woSet.has(r.workOrderId) && userSet.has(r.changedById));
    const missingWo = rows.filter((r) => !woSet.has(r.workOrderId));
    const missingUser = rows.filter((r) => woSet.has(r.workOrderId) && !userSet.has(r.changedById));
    const dates = rows.map((r) => r.changedAt.getTime());

    console.log({
      linhasNoDump: rows.length,
      periodo: [new Date(Math.min(...dates)).toISOString(), new Date(Math.max(...dates)).toISOString()],
      osNoDump: new Set(rows.map((r) => r.workOrderId)).size,
      jaExistemNoBanco: existing.size,
      semOsNoBanco: missingWo.length,
      semUsuarioNoBanco: missingUser.length,
      aInserir: toInsert.length,
      osAfetadas: new Set(toInsert.map((r) => r.workOrderId)).size,
    });

    if (!apply) {
      console.log("\nDry-run: nada foi gravado. Rode com --apply para inserir.");
      return;
    }

    const result = await prisma.statusHistory.createMany({ data: toInsert, skipDuplicates: true });
    const logFile = `restore-status-history.${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    fs.writeFileSync(logFile, JSON.stringify({ insertedIds: toInsert.map((r) => r.id), count: result.count }, null, 1));
    console.log(`\nInseridas ${result.count} linhas. Ids gravados em ${logFile}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("FALHA:", e);
  process.exit(1);
});
