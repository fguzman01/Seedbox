CREATE TABLE "agent_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"items" integer NOT NULL,
	"accepted" integer NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "agent_deliveries_kind_received_at_idx" ON "agent_deliveries" USING btree ("kind","received_at");