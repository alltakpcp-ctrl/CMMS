-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "estimatedMinutes" INTEGER,
ADD COLUMN     "numMaintainers" INTEGER,
ADD COLUMN     "plannedParts" JSONB,
ADD COLUMN     "safetyEquipment" TEXT;
