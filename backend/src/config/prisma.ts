import { PrismaClient } from "@prisma/client";

// O Neon hiberna o compute quando ocioso (scale-to-zero); a primeira transação
// interativa depois disso pode levar alguns segundos só para conectar. Com o
// padrão do Prisma (maxWait 2s / timeout 5s) a ação inteira era desfeita
// (P2028) — transição, StatusHistory e Execution juntos.
export const prisma = new PrismaClient({
  transactionOptions: { maxWait: 15_000, timeout: 30_000 },
});
