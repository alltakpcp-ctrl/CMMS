-- AlterTable
ALTER TABLE "Execution" ADD COLUMN     "endNote" TEXT,
ADD COLUMN     "endedById" TEXT,
ADD COLUMN     "outcome" TEXT,
ADD COLUMN     "startNote" TEXT,
ADD COLUMN     "startedById" TEXT;

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_endedById_fkey" FOREIGN KEY ("endedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
