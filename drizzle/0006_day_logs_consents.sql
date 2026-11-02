CREATE TABLE "day_logs" (
	"owner_id" text NOT NULL,
	"day" date NOT NULL,
	"pain" text,
	"moods" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "day_logs_owner_id_day_pk" PRIMARY KEY("owner_id","day")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "age_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "transfer_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "day_logs" ADD CONSTRAINT "day_logs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;