import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { Role } from "../src/domain/enums";

const prisma = new PrismaClient();

// Seed mínimo para produção real (dados verdadeiros): cria apenas o usuário
// SUPERVISOR inicial, necessário para logar e cadastrar o restante (ativos,
// peças, demais usuários) pela própria aplicação. NÃO popula ativos, peças
// nem OS de demonstração — isso é feito por seed.ts (dev) / seed-demo.ts
// (demonstração), que não devem rodar em produção real.
async function main() {
  const email = process.env.SEED_PROD_ADMIN_EMAIL;
  const password = process.env.SEED_PROD_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Defina SEED_PROD_ADMIN_EMAIL e SEED_PROD_ADMIN_PASSWORD no ambiente antes de rodar o seed de produção."
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { name: "Administrador", email, role: Role.SUPERVISOR, passwordHash },
  });

  console.log(`Seed de produção concluído: usuário SUPERVISOR "${email}" criado/confirmado.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
