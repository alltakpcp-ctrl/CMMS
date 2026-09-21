-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "withdrawalRequestId" TEXT;

-- CreateIndex
CREATE INDEX "StockMovement_withdrawalRequestId_idx" ON "StockMovement"("withdrawalRequestId");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_withdrawalRequestId_fkey" FOREIGN KEY ("withdrawalRequestId") REFERENCES "StockWithdrawalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
