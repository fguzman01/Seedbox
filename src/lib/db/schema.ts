import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { INTENSITIES, VERTICALS, WILLINGNESS_TO_PAY } from "../pains";

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
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("signals_source_external_id_idx").on(t.source, t.externalId),
    index("signals_published_at_idx").on(t.publishedAt),
  ],
);

export type Signal = typeof signals.$inferSelect;

/** A concrete problem extracted from a signal by the AI (H2). */
export const pains = pgTable(
  "pains",
  {
    id: serial("id").primaryKey(),
    signalId: integer("signal_id")
      .notNull()
      .references(() => signals.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    persona: text("persona").notNull(),
    quote: text("quote").notNull(),
    vertical: text("vertical", { enum: VERTICALS }).notNull(),
    intensity: text("intensity", { enum: INTENSITIES }).notNull(),
    willingnessToPay: text("willingness_to_pay", { enum: WILLINGNESS_TO_PAY }).notNull(),
    model: text("model").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [index("pains_signal_id_idx").on(t.signalId), index("pains_vertical_idx").on(t.vertical)],
);

export type Pain = typeof pains.$inferSelect;
