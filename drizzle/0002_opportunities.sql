CREATE TABLE "opportunities" (
	"id" serial PRIMARY KEY NOT NULL,
	"domain" text DEFAULT 'software' NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pains" ADD COLUMN "opportunity_id" integer;--> statement-breakpoint
ALTER TABLE "pains" ADD CONSTRAINT "pains_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pains_opportunity_id_idx" ON "pains" USING btree ("opportunity_id");