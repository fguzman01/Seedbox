CREATE TABLE "signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"domain" text DEFAULT 'software' NOT NULL,
	"external_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"body" text NOT NULL,
	"author" text,
	"published_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "signals_source_external_id_idx" ON "signals" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "signals_published_at_idx" ON "signals" USING btree ("published_at");