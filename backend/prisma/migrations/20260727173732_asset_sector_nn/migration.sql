-- CreateTable
CREATE TABLE "AssetSector" (
    "assetId" TEXT NOT NULL,
    "sectorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetSector_pkey" PRIMARY KEY ("assetId","sectorId")
);

-- AddForeignKey
ALTER TABLE "AssetSector" ADD CONSTRAINT "AssetSector_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetSector" ADD CONSTRAINT "AssetSector_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: setor primário atual de cada Asset também vira vínculo N:N
INSERT INTO "AssetSector" ("assetId","sectorId","createdAt")
SELECT "id","sectorId", now() FROM "Asset"
ON CONFLICT DO NOTHING;
