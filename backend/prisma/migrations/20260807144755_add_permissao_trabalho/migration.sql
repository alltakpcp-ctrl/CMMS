-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "trabalhoEmAltura" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PermissaoTrabalho" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "emittedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermissaoTrabalho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissaoTrabalhoResposta" (
    "id" TEXT NOT NULL,
    "permissaoTrabalhoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "pergunta" TEXT NOT NULL,
    "resposta" TEXT,
    "observacao" TEXT,

    CONSTRAINT "PermissaoTrabalhoResposta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PermissaoTrabalho_workOrderId_key" ON "PermissaoTrabalho"("workOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PermissaoTrabalhoResposta_permissaoTrabalhoId_ordem_key" ON "PermissaoTrabalhoResposta"("permissaoTrabalhoId", "ordem");

-- AddForeignKey
ALTER TABLE "PermissaoTrabalho" ADD CONSTRAINT "PermissaoTrabalho_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissaoTrabalho" ADD CONSTRAINT "PermissaoTrabalho_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissaoTrabalhoResposta" ADD CONSTRAINT "PermissaoTrabalhoResposta_permissaoTrabalhoId_fkey" FOREIGN KEY ("permissaoTrabalhoId") REFERENCES "PermissaoTrabalho"("id") ON DELETE CASCADE ON UPDATE CASCADE;
