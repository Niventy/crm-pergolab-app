ALTER TABLE "echanges" ALTER COLUMN "type" SET DATA TYPE text USING "type"::text;--> statement-breakpoint
DROP TYPE "public"."echange_type";