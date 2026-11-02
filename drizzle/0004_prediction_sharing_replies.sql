DROP INDEX "posts_board_created";--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "board" SET DEFAULT 'question';--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "couples" ADD COLUMN "sharing_notice" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "usual_cycle_days" integer;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_parent" ON "comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "posts_created" ON "posts" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_usual_cycle" CHECK (usual_cycle_days between 21 and 45);