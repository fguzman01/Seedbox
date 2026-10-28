import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/** Raw items collected from external sources, before AI extraction. */
export const signals = pgTable(
  "signals",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull(),
    domain: text("domain").notNull().default("software"),
    externalId: text("external_id").notNull(),
    url: text("url").notNull(),
    title: text("title"),
    body: text("body").notNull(),
    author: text("author"),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().default(sql`now()`),
    /** pending → processed | discarded, set by the extraction step (H2). */
    status: text("status", { enum: ["pending", "processed", "discarded"] })
      .notNull()
      .default("pending"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [
    uniqueIndex("signals_source_external_id_idx").on(t.source, t.externalId),
    index("signals_published_at_idx").on(t.publishedAt),
  ],
);

export type Signal = typeof signals.$inferSelect;
