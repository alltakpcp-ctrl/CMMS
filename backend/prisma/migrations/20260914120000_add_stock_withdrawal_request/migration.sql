-- CreateTable
CREATE TABLE "StockWithdrawalRequest" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "subtaskId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "notApplicable" BOOLEAN NOT NULL DEFAULT false,
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockWithdrawalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockWithdrawalRequestItem" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "StockWithdrawalRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockWithdrawalRequest_workOrderId_idx" ON "StockWithdrawalRequest"("workOrderId");

-- CreateIndex
CREATE INDEX "StockWithdrawalRequest_subtaskId_idx" ON "StockWithdrawalRequest"("subtaskId");

-- CreateIndex
CREATE INDEX "StockWithdrawalRequest_status_idx" ON "StockWithdrawalRequest"("status");

-- AddForeignKey
ALTER TABLE "StockWithdrawalRequest" ADD CONSTRAINT "StockWithdrawalRequest_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockWithdrawalRequest" ADD CONSTRAINT "StockWithdrawalRequest_subtaskId_fkey" FOREIGN KEY ("subtaskId") REFERENCES "Subtask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockWithdrawalRequest" ADD CONSTRAINT "StockWithdrawalRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockWithdrawalRequest" ADD CONSTRAINT "StockWithdrawalRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockWithdrawalRequestItem" ADD CONSTRAINT "StockWithdrawalRequestItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "StockWithdrawalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockWithdrawalRequestItem" ADD CONSTRAINT "StockWithdrawalRequestItem_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

