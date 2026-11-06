CREATE TABLE "platform_audits" (
	"scan_id" text PRIMARY KEY NOT NULL,
	"install_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_installs" (
	"id" text PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"store_key" text NOT NULL,
	"store_name" text,
	"store_url" text,
	"sealed_tokens" text,
	"tokens_expire_at" timestamp with time zone,
	"tokens_at" timestamp with time zone,
	"refresh_due_at" timestamp with time zone,
	"refresh_lease_until" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"embed_token_hash" text,
	"installed_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"audit_due_at" timestamp with time zone,
	"audit_lease_until" timestamp with time zone,
	"last_audit_at" timestamp with time zone,
	CONSTRAINT "platform_installs_store" UNIQUE("platform","store_key"),
	CONSTRAINT "platform_installs_platform" CHECK ("platform_installs"."platform" IN ('salla', 'zid')),
	CONSTRAINT "platform_installs_status" CHECK ("platform_installs"."status" IN ('active', 'reauth'))
);
--> statement-breakpoint
ALTER TABLE "platform_audits" ADD CONSTRAINT "platform_audits_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_audits" ADD CONSTRAINT "platform_audits_install_id_platform_installs_id_fk" FOREIGN KEY ("install_id") REFERENCES "public"."platform_installs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_audits_install" ON "platform_audits" USING btree ("install_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_installs_embed" ON "platform_installs" USING btree ("embed_token_hash") WHERE "platform_installs"."embed_token_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "platform_installs_audit_due" ON "platform_installs" USING btree ("audit_due_at") WHERE "platform_installs"."audit_due_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "platform_installs_refresh_due" ON "platform_installs" USING btree ("refresh_due_at") WHERE "platform_installs"."refresh_due_at" IS NOT NULL;