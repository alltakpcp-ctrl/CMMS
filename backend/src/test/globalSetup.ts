import { execSync } from "node:child_process";
import path from "node:path";

// Prepara um banco Postgres descartável para os testes de integração: reseta
// o schema (drop + recria) e aplica as migrações reais (mesmas de produção)
// contra TEST_DATABASE_URL. Usar um branch/banco Postgres dedicado a testes
// (nunca o de dev), pois `migrate reset` apaga todos os dados.
export default async function globalSetup() {
  const backendRoot = path.resolve(__dirname, "../..");
  const databaseUrl = process.env.TEST_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "Defina TEST_DATABASE_URL (Postgres dedicado a testes) antes de rodar os testes de integração."
    );
  }

  execSync("npx prisma migrate reset --force --skip-seed", {
    cwd: backendRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });
}
