CREATE TABLE "crawl_pages" (
	"crawl_id" text NOT NULL,
	"url" text NOT NULL,
	"seq" bigserial NOT NULL,
	"depth" integer NOT NULL,
	"bucket" text NOT NULL,
	"state" text NOT NULL,
	"status" integer,
	"template" text,
	"title" text,
	"skeleton" text,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"render_issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scan_id" text,
	"error" text,
	CONSTRAINT "crawl_pages_crawl_id_url_pk" PRIMARY KEY("crawl_id","url"),
	CONSTRAINT "crawl_pages_state" CHECK ("crawl_pages"."state" IN ('found', 'checked', 'blocked', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "crawls" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"site_id" text,
	"start_url" text NOT NULL,
	"origin" text NOT NULL,
	"state" text NOT NULL,
	"error" text,
	"page_cap" integer NOT NULL,
	"delay_ms" integer NOT NULL,
	"pages_found" integer DEFAULT 0 NOT NULL,
	"pages_checked" integer DEFAULT 0 NOT NULL,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"lease_until" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"render_started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"templates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"titles" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "crawls_state" CHECK ("crawls"."state" IN ('queued', 'running', 'rendering', 'done', 'failed', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "account_scans" DROP CONSTRAINT "account_scans_source";--> statement-breakpoint
ALTER TABLE "crawl_pages" ADD CONSTRAINT "crawl_pages_crawl_id_crawls_id_fk" FOREIGN KEY ("crawl_id") REFERENCES "public"."crawls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawl_pages" ADD CONSTRAINT "crawl_pages_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawls" ADD CONSTRAINT "crawls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawls" ADD CONSTRAINT "crawls_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crawl_pages_next" ON "crawl_pages" USING btree ("crawl_id","state","bucket","depth","seq");--> statement-breakpoint
CREATE INDEX "crawl_pages_template" ON "crawl_pages" USING btree ("crawl_id","template","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "crawls_one_active" ON "crawls" USING btree ("user_id") WHERE "crawls"."state" IN ('queued', 'running', 'rendering');--> statement-breakpoint
CREATE INDEX "crawls_claim" ON "crawls" USING btree ("state","lease_until");--> statement-breakpoint
CREATE INDEX "crawls_site" ON "crawls" USING btree ("site_id","created_at");--> statement-breakpoint
ALTER TABLE "account_scans" ADD CONSTRAINT "account_scans_source" CHECK ("account_scans"."source" IN ('manual', 'monitor', 'crawl'));