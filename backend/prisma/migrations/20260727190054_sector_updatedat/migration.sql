-- AlterTable
ALTER TABLE "Sector" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "Sector" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "Sector" ALTER COLUMN "updatedAt" SET NOT NULL;
