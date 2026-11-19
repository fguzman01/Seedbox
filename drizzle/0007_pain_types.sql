ALTER TABLE "opportunities" ADD COLUMN "type" text DEFAULT 'concrete' NOT NULL;--> statement-breakpoint
ALTER TABLE "pains" ADD COLUMN "type" text DEFAULT 'concrete' NOT NULL;