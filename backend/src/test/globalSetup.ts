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

  // Trava contra o incidente de 2026-09-17 (CLAUDE.md §2): o reset abaixo
  // apaga tudo, então nunca pode cair no mesmo host do DATABASE_URL do .env
  // (que já apontou para produção).
  const hostOf = (url: string | undefined) => {
    try {
      return url ? new URL(url).host : null;
    } catch {
      return null;
    }
  };
  const appDbHost = hostOf(process.env.DATABASE_URL);
  if (appDbHost && hostOf(databaseUrl) === appDbHost) {
    throw new Error(
      `TEST_DATABASE_URL aponta para o mesmo host do DATABASE_URL (${appDbHost}). Use um banco de teste separado.`
    );
  }

  execSync("npx prisma migrate reset --force --skip-seed", {
    cwd: backendRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });
}
