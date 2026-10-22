import { Prisma } from "@prisma/client";

// Formato OS-YYYY-NNNNNN (§7 do CLAUDE.md), sequência reinicia a cada ano.
// Deve ser chamado dentro de uma prisma.$transaction: o advisory lock de
// transação serializa as aberturas simultâneas (sem ele, duas transações liam
// o mesmo "último número" e a segunda falhava com P2002 → 500). O lock é
// liberado sozinho no commit/rollback.
export async function generateWorkOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('cmms:workorder-number'))`;

  const year = new Date().getFullYear();
  const prefix = `OS-${year}-`;

  const last = await tx.workOrder.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: "desc" },
  });

  const lastSequence = last ? Number(last.number.slice(prefix.length)) : 0;
  const nextSequence = lastSequence + 1;

  return `${prefix}${String(nextSequence).padStart(6, "0")}`;
}
