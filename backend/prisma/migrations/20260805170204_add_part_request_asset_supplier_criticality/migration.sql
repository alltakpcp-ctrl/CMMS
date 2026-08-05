-- AlterTable
ALTER TABLE "PartRequest" ADD COLUMN     "assetId" TEXT,
ADD COLUMN     "criticality" INTEGER,
ADD COLUMN     "supplierName" TEXT;

-- AddForeignKey
ALTER TABLE "PartRequest" ADD CONSTRAINT "PartRequest_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
