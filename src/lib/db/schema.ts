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

/** A group of pains that describe the same problem (H3, ADR-0004). */
export const opportunities = pgTable("opportunities", {
  id: serial("id").primaryKey(),
  domain: text("domain").notNull().default("software"),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  model: text("model").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  // Market assessment (H4, ADR-0005); null until `npm run assess` evaluates the opportunity.
  /** 10 = nobody solves it well, 0 = saturated market. */
  competitionScore: integer("competition_score"),
  competitionRationale: text("competition_rationale"),
  competitors: jsonb("competitors").$type<Competitor[]>(),
  /** 10 = one developer with AI can build it in a few weeks. */
  buildabilityScore: integer("buildability_score"),
  buildabilityRationale: text("buildability_rationale"),
  assessedAt: timestamp("assessed_at", { withTimezone: true }),
  assessmentModel: text("assessment_model"),
});

export interface Competitor {
  name: string;
  url: string;
  note: string;
}

export type Opportunity = typeof opportunities.$inferSelect;

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
    /** null until the clustering step assigns the pain to an opportunity. */
    opportunityId: integer("opportunity_id").references(() => opportunities.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("pains_signal_id_idx").on(t.signalId),
    index("pains_vertical_idx").on(t.vertical),
    index("pains_opportunity_id_idx").on(t.opportunityId),
  ],
);

export type Pain = typeof pains.$inferSelect;
