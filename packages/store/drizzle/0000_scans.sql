CREATE TABLE "scans" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"state" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"score" integer,
	"report" jsonb
);
--> statement-breakpoint
CREATE INDEX "scans_created_at" ON "scans" USING btree ("created_at");