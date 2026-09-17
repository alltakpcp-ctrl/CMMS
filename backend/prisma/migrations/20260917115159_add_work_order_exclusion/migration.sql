-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "excludedAt" TIMESTAMP(3),
ADD COLUMN     "excludedById" TEXT,
ADD COLUMN     "exclusionReason" TEXT;

-- AlterTable
ALTER TABLE "MaintenancePlan" ADD COLUMN     "excludedAt" TIMESTAMP(3),
ADD COLUMN     "excludedById" TEXT,
ADD COLUMN     "exclusionReason" TEXT;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_excludedById_fkey" FOREIGN KEY ("excludedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_excludedById_fkey" FOREIGN KEY ("excludedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
