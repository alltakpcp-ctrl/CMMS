-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "ppe" JSONB,
ADD COLUMN     "tools" JSONB;

-- CreateTable
CREATE TABLE "WorkOrderPlannedPart" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderPlannedPart_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "WorkOrderPlannedPart" ADD CONSTRAINT "WorkOrderPlannedPart_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderPlannedPart" ADD CONSTRAINT "WorkOrderPlannedPart_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
