CREATE TABLE "partner_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"couple_id" text NOT NULL,
	"kind" text NOT NULL,
	"day" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_alerts_kind" CHECK (kind in ('start', 'upcoming', 'end', 'fertile'))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "alert_start" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "alert_upcoming" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "alert_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "alert_fertile" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "partner_alerts" ADD CONSTRAINT "partner_alerts_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "partner_alerts_daily" ON "partner_alerts" USING btree ("couple_id","kind","day");