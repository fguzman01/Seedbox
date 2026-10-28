import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { createDb, type Database } from "./db/client";

export const testDatabaseUrl = process.env.TEST_DATABASE_URL;

/**
 * Migrates the test database once per file and empties it before each test.
 * Use inside `describe.skipIf(!testDatabaseUrl)`.
 */
export function useTestDb(): Database {
  const { db, close } = createDb(testDatabaseUrl);

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./drizzle" });
  });
  beforeEach(async () => {
    await db.execute(sql`truncate signals, pains restart identity cascade`);
  });
  afterAll(async () => {
    await close();
  });

  return db;
}
