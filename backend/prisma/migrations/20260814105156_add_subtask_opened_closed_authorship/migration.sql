-- AlterTable
ALTER TABLE "Subtask" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedById" TEXT,
ADD COLUMN     "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AddForeignKey
ALTER TABLE "Subtask" ADD CONSTRAINT "Subtask_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: linhas existentes recebem CURRENT_TIMESTAMP em openedAt pelo
-- DEFAULT acima, o que não representa a abertura real. Corrige para createdAt.
UPDATE "Subtask" SET "openedAt" = "createdAt";

-- Backfill de closedAt para linhas já encerradas.
-- CONCLUIDA: finishedAt já é o timestamp real de encerramento (fonte exata).
UPDATE "Subtask" SET "closedAt" = "finishedAt" WHERE "status" = 'CONCLUIDA' AND "finishedAt" IS NOT NULL;

-- CANCELADA: não existe timestamp de encerramento real hoje. updatedAt é a
-- melhor aproximação disponível (é tocado no mesmo UPDATE que muda o status
-- para CANCELADA, pois cancelSubtask não altera mais nenhum outro campo
-- depois disso) — mas é uma APROXIMAÇÃO, não um valor exato: se a linha for
-- tocada por qualquer outra escrita após o cancelamento, updatedAt divergiria
-- do momento real do cancelamento. Não há como distinguir isso retroativamente.
UPDATE "Subtask" SET "closedAt" = "updatedAt" WHERE "status" = 'CANCELADA';
