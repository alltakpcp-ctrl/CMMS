import { Prisma } from "@prisma/client";

// Formato PC-YYYY-NNNNNN, sequência reinicia a cada ano (mesmo padrão de
// generateWorkOrderNumber em lib/workOrderNumber.ts). Deve ser chamado dentro
// de uma prisma.$transaction para evitar colisão em concorrência.
export async function generatePurchaseOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PC-${year}-`;

  const last = await tx.purchaseOrder.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: "desc" },
  });

  const lastSequence = last ? Number(last.number.slice(prefix.length)) : 0;
  const nextSequence = lastSequence + 1;

  return `${prefix}${String(nextSequence).padStart(6, "0")}`;
}
