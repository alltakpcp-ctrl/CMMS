-- Preventiva/Agenda: MaintenancePlan.periodicity vira opcional (plano rascunho
-- sem periodicidade, criado quando um OPERADOR abre uma OS PREVENTIVA sem
-- plano prévio existente).
ALTER TABLE "MaintenancePlan" ALTER COLUMN "periodicity" DROP NOT NULL;

-- estimatedMinutes (Int) -> estimatedHours (Decimal) em WorkOrder,
-- MaintenancePlan e Subtask. Backfill divide por 60 antes de dropar a coluna
-- antiga, para não perder os dados já cadastrados.

-- WorkOrder
ALTER TABLE "WorkOrder" ADD COLUMN "estimatedHours" DECIMAL(5,2);
UPDATE "WorkOrder" SET "estimatedHours" = "estimatedMinutes"::decimal / 60.0 WHERE "estimatedMinutes" IS NOT NULL;
ALTER TABLE "WorkOrder" DROP COLUMN "estimatedMinutes";

-- MaintenancePlan
ALTER TABLE "MaintenancePlan" ADD COLUMN "estimatedHours" DECIMAL(5,2);
UPDATE "MaintenancePlan" SET "estimatedHours" = "estimatedMinutes"::decimal / 60.0 WHERE "estimatedMinutes" IS NOT NULL;
ALTER TABLE "MaintenancePlan" DROP COLUMN "estimatedMinutes";

-- Subtask (estimatedHours continua obrigatório — coluna criada nullable só
-- para permitir o backfill, depois volta a NOT NULL).
ALTER TABLE "Subtask" ADD COLUMN "estimatedHours" DECIMAL(5,2);
UPDATE "Subtask" SET "estimatedHours" = "estimatedMinutes"::decimal / 60.0;
ALTER TABLE "Subtask" ALTER COLUMN "estimatedHours" SET NOT NULL;
ALTER TABLE "Subtask" DROP COLUMN "estimatedMinutes";
