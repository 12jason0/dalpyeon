CREATE TABLE "notes" (
	"id" text PRIMARY KEY NOT NULL,
	"couple_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"day" date NOT NULL,
	"seq" integer NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notes_seq" CHECK (seq between 1 and 3),
	CONSTRAINT "notes_body" CHECK (char_length(body) between 1 and 50)
);
--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notes_daily" ON "notes" USING btree ("sender_id","day","seq");--> statement-breakpoint
CREATE INDEX "notes_couple_day" ON "notes" USING btree ("couple_id","day");