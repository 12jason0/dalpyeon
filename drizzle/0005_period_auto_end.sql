ALTER TABLE "periods" ADD COLUMN "auto_ended" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "periods" ADD COLUMN "ask_end_again_on" date;--> statement-breakpoint
ALTER TABLE "periods" ADD COLUMN "end_ask_sent" boolean DEFAULT false NOT NULL;