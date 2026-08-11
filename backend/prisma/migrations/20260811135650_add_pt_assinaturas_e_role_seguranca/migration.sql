-- AlterTable
ALTER TABLE "PermissaoTrabalho" ADD COLUMN     "rejectionReason" TEXT;

-- CreateTable
CREATE TABLE "PermissaoTrabalhoAssinatura" (
    "id" TEXT NOT NULL,
    "permissaoTrabalhoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3),
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermissaoTrabalhoAssinatura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PermissaoTrabalhoAssinatura_permissaoTrabalhoId_userId_key" ON "PermissaoTrabalhoAssinatura"("permissaoTrabalhoId", "userId");

-- AddForeignKey
ALTER TABLE "PermissaoTrabalhoAssinatura" ADD CONSTRAINT "PermissaoTrabalhoAssinatura_permissaoTrabalhoId_fkey" FOREIGN KEY ("permissaoTrabalhoId") REFERENCES "PermissaoTrabalho"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissaoTrabalhoAssinatura" ADD CONSTRAINT "PermissaoTrabalhoAssinatura_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissaoTrabalhoAssinatura" ADD CONSTRAINT "PermissaoTrabalhoAssinatura_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
