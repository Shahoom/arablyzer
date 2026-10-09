CREATE TABLE "account_scans" (
	"scan_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"site_id" text,
	"source" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "account_scans_source" CHECK ("account_scans"."source" IN ('manual', 'monitor'))
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sites_user_url" UNIQUE("user_id","url")
);
--> statement-breakpoint
ALTER TABLE "account_scans" ADD CONSTRAINT "account_scans_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_scans" ADD CONSTRAINT "account_scans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_scans" ADD CONSTRAINT "account_scans_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_scans_user_created" ON "account_scans" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "account_scans_site" ON "account_scans" USING btree ("site_id","created_at");