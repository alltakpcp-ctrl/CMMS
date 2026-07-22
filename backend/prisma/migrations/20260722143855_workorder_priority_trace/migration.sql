-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "priorityAdjustedAt" TIMESTAMP(3),
ADD COLUMN     "priorityAdjustedById" TEXT,
ADD COLUMN     "priorityAdjustedByTech" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priorityOriginal" TEXT;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_priorityAdjustedById_fkey" FOREIGN KEY ("priorityAdjustedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
