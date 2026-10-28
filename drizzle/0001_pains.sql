CREATE TABLE "pains" (
	"id" serial PRIMARY KEY NOT NULL,
	"signal_id" integer NOT NULL,
	"description" text NOT NULL,
	"persona" text NOT NULL,
	"quote" text NOT NULL,
	"vertical" text NOT NULL,
	"intensity" text NOT NULL,
	"willingness_to_pay" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN "processed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pains" ADD CONSTRAINT "pains_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pains_signal_id_idx" ON "pains" USING btree ("signal_id");--> statement-breakpoint
CREATE INDEX "pains_vertical_idx" ON "pains" USING btree ("vertical");