-- CreateTable
CREATE TABLE "WorkOrderAssignee" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderAssignee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkOrderAssignee_workOrderId_idx" ON "WorkOrderAssignee"("workOrderId");

-- CreateIndex
CREATE INDEX "WorkOrderAssignee_userId_idx" ON "WorkOrderAssignee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderAssignee_workOrderId_userId_key" ON "WorkOrderAssignee"("workOrderId", "userId");

-- AddForeignKey
ALTER TABLE "WorkOrderAssignee" ADD CONSTRAINT "WorkOrderAssignee_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderAssignee" ADD CONSTRAINT "WorkOrderAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
