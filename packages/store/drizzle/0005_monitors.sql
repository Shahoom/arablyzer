CREATE TABLE "alert_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"webhook_url" text,
	"webhook_secret" text,
	"webhook_kind" text,
	"webhook_failures" integer DEFAULT 0 NOT NULL,
	"webhook_disabled_at" timestamp with time zone,
	"drop_threshold" integer NOT NULL,
	"on_critical" boolean NOT NULL,
	"on_down" boolean NOT NULL,
	"weekly_summary" boolean NOT NULL,
	"email" boolean NOT NULL,
	"last_summary_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "monitor_runs" (
	"scan_id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"notified_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"retry_after" timestamp with time zone,
	CONSTRAINT "monitor_runs_slot" UNIQUE("site_id","scheduled_for")
);
--> statement-breakpoint
CREATE TABLE "monitors" (
	"site_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"every_days" integer NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "monitors_every_days" CHECK ("monitors"."every_days" >= 1)
);
--> statement-breakpoint
ALTER TABLE "alert_settings" ADD CONSTRAINT "alert_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_runs" ADD CONSTRAINT "monitor_runs_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_runs" ADD CONSTRAINT "monitor_runs_site_id_monitors_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."monitors"("site_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "monitor_runs_pending" ON "monitor_runs" USING btree ("notified_at","scheduled_for");--> statement-breakpoint
CREATE INDEX "monitors_due" ON "monitors" USING btree ("paused","next_run_at");--> statement-breakpoint
CREATE INDEX "monitors_user" ON "monitors" USING btree ("user_id");