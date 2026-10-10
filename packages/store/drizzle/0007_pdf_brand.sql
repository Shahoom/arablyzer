CREATE TABLE "account_brand" (
	"user_id" text PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"color" text,
	"logo" "bytea",
	"logo_type" text,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "account_brand_logo" CHECK (("account_brand"."logo" IS NULL) = ("account_brand"."logo_type" IS NULL)),
	CONSTRAINT "account_brand_logo_type" CHECK ("account_brand"."logo_type" IS NULL OR "account_brand"."logo_type" IN ('image/png', 'image/jpeg', 'image/webp'))
);
--> statement-breakpoint
CREATE TABLE "pdf_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"scan_id" text,
	"crawl_id" text,
	"base_id" text,
	"language" text NOT NULL,
	"state" text NOT NULL,
	"error" text,
	"pdf" "bytea",
	"bytes" integer,
	"created_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"lease_until" timestamp with time zone,
	CONSTRAINT "pdf_jobs_kind" CHECK ("pdf_jobs"."kind" IN ('scan', 'crawl', 'compare-scans', 'compare-crawls')),
	CONSTRAINT "pdf_jobs_state" CHECK ("pdf_jobs"."state" IN ('queued', 'running', 'done', 'failed', 'expired')),
	CONSTRAINT "pdf_jobs_language" CHECK ("pdf_jobs"."language" IN ('ar', 'en')),
	CONSTRAINT "pdf_jobs_subject" CHECK (("pdf_jobs"."scan_id" IS NULL) <> ("pdf_jobs"."crawl_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "pdf_usage" (
	"user_id" text NOT NULL,
	"month" text NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "pdf_usage_user_id_month_pk" PRIMARY KEY("user_id","month")
);
--> statement-breakpoint
ALTER TABLE "account_brand" ADD CONSTRAINT "account_brand_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pdf_jobs" ADD CONSTRAINT "pdf_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pdf_jobs" ADD CONSTRAINT "pdf_jobs_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pdf_jobs" ADD CONSTRAINT "pdf_jobs_crawl_id_crawls_id_fk" FOREIGN KEY ("crawl_id") REFERENCES "public"."crawls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pdf_usage" ADD CONSTRAINT "pdf_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pdf_jobs_one_active" ON "pdf_jobs" USING btree ("user_id") WHERE "pdf_jobs"."state" IN ('queued', 'running');--> statement-breakpoint
CREATE INDEX "pdf_jobs_claim" ON "pdf_jobs" USING btree ("state","lease_until");--> statement-breakpoint
CREATE INDEX "pdf_jobs_user" ON "pdf_jobs" USING btree ("user_id","created_at");