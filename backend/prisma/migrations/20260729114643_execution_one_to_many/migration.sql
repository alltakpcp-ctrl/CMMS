-- DropIndex
DROP INDEX "Execution_workOrderId_key";

-- CreateIndex
CREATE INDEX "Execution_workOrderId_idx" ON "Execution"("workOrderId");
