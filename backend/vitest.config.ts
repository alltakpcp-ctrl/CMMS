import { defineConfig } from "vitest/config";
import dotenv from "dotenv";

dotenv.config();

// Testes de integração (src/test/*.test.ts) rodam contra um Postgres isolado
// (TEST_DATABASE_URL — usar um branch/banco dedicado a testes, nunca o de
// dev), resetado pelo globalSetup. Testes unitários (src/lib/*) não tocam o
// banco e rodam normalmente.
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error(
    "Defina TEST_DATABASE_URL (Postgres dedicado a testes) para rodar a suíte de testes."
  );
}

export default defineConfig({
  test: {
    globalSetup: "./src/test/globalSetup.ts",
    env: {
      DATABASE_URL: testDatabaseUrl,
      JWT_SECRET: "test-secret",
      JWT_EXPIRES_IN: "1h",
      CORS_ORIGIN: "http://localhost:5173",
    },
    fileParallelism: false,
  },
});
