CREATE TABLE "sotaw_results" (
	"run_id" text NOT NULL,
	"domain" text NOT NULL,
	"country" text NOT NULL,
	"rank" integer NOT NULL,
	"position" integer NOT NULL,
	"state" text NOT NULL,
	"reason" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"scan_id" text,
	"outcome" jsonb,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "sotaw_results_run_id_domain_pk" PRIMARY KEY("run_id","domain"),
	CONSTRAINT "sotaw_results_state" CHECK ("sotaw_results"."state" IN ('pending', 'running', 'done', 'skipped', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "sotaw_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"frame_id" text NOT NULL,
	"frame_sha" text NOT NULL,
	"seed" text NOT NULL,
	"state" text NOT NULL,
	"total" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "sotaw_runs_state" CHECK ("sotaw_runs"."state" IN ('running', 'finished', 'aborted'))
);
--> statement-breakpoint
ALTER TABLE "sotaw_results" ADD CONSTRAINT "sotaw_results_run_id_sotaw_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."sotaw_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sotaw_results_next" ON "sotaw_results" USING btree ("run_id","state","position");