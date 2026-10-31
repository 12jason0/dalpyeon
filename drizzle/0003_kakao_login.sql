ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "kakao_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_kakao_id_unique" UNIQUE("kakao_id");