CREATE TABLE "admin_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"actor_id" text NOT NULL,
	"actor_email" text,
	"action" text NOT NULL,
	"target_id" text,
	"target_email" text,
	"detail" jsonb NOT NULL,
	"network" text
);
--> statement-breakpoint
CREATE TABLE "admin_user_state" (
	"user_id" text PRIMARY KEY NOT NULL,
	"suspended_at" timestamp with time zone,
	"last_sign_in_at" timestamp with time zone,
	"overrides" jsonb,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_user_state" ADD CONSTRAINT "admin_user_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_at" ON "admin_audit" USING btree ("at");--> statement-breakpoint
CREATE INDEX "admin_audit_target" ON "admin_audit" USING btree ("target_id","at");--> statement-breakpoint
CREATE INDEX "admin_audit_actor" ON "admin_audit" USING btree ("actor_id");