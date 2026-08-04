-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "parentPurchaseOrderId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "canPurchase" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_parentPurchaseOrderId_fkey" FOREIGN KEY ("parentPurchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: renomeia status legado ENVIADO -> EM_ANALISE (nao mexe em APROVADO/REJEITADO)
UPDATE "PurchaseOrder" SET "status" = 'EM_ANALISE' WHERE "status" = 'ENVIADO';

-- AlterTable
ALTER TABLE "PurchaseOrder" ALTER COLUMN "status" SET DEFAULT 'EM_ANALISE';
