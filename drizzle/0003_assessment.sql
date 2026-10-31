ALTER TABLE "opportunities" ADD COLUMN "competition_score" integer;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "competition_rationale" text;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "competitors" jsonb;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "buildability_score" integer;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "buildability_rationale" text;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "assessed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "assessment_model" text;