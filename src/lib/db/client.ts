import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

export function createDb(url = process.env.DATABASE_URL) {
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  const client = postgres(url, { max: 5 });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}

let shared: Database | undefined;

/** Lazily-created connection shared by the web app. */
export function getDb(): Database {
  shared ??= createDb().db;
  return shared;
}
