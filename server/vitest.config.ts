import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // todos os testes usam o mesmo banco: um arquivo por vez
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL || "postgres://conduta@localhost:5544/conduta_test",
      PUBLIC_URL: "http://localhost:5180",
      DATA_DIR: "../app/public/data",
      TRANSCRIPTS_DIR: "./data/transcricoes",
      UPLOADS_DIR: join(tmpdir(), `conduta-test-uploads-${process.pid}`),
      CONFIRM_SECRET: "segredo-de-teste",
      ADMIN_EMAILS: "admin@teste.com",
    },
  },
});
