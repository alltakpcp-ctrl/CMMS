/*
  Warnings:

  - Made the column `priority` on table `WorkOrder` required. This step will fail if there are existing NULL values in that column.

*/
-- Preenche OS antigas sem priority com o valor padrão (MEDIA) antes de travar a coluna.
UPDATE "WorkOrder" SET "priority" = 'MEDIA' WHERE "priority" IS NULL;

-- AlterTable
ALTER TABLE "WorkOrder" ALTER COLUMN "priority" SET NOT NULL;
