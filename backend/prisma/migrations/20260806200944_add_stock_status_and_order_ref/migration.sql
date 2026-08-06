-- AlterTable
ALTER TABLE "Part" ADD COLUMN     "stockStatusOverride" TEXT;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "orderRef" TEXT,
ADD COLUMN     "statusSnapshot" TEXT;
