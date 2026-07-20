/*
  Warnings:

  - You are about to drop the column `sector` on the `Asset` table. All the data in the column will be lost.
  - You are about to drop the column `targetSector` on the `WorkOrder` table. All the data in the column will be lost.
  - Added the required column `sectorId` to the `Asset` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Asset" DROP COLUMN "sector",
ADD COLUMN     "sectorId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "WorkOrder" DROP COLUMN "targetSector",
ADD COLUMN     "targetSectorId" TEXT;

-- CreateTable
CREATE TABLE "Sector" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sector_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sector_name_key" ON "Sector"("name");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_targetSectorId_fkey" FOREIGN KEY ("targetSectorId") REFERENCES "Sector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
