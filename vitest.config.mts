import path from "node:path";
import { defineConfig } from "vitest/config";

// Load .env when present; in production the variables come from the environment.
try {
  process.loadEnvFile(".env");
} catch {}

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    // The database tests share one test database.
    fileParallelism: false,
  },
});
