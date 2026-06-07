ALTER TABLE "leads" ALTER COLUMN "date_installation" SET DATA TYPE text USING "date_installation"::text;--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "date_souhaitee_appel" SET DATA TYPE text USING "date_souhaitee_appel"::text;--> statement-breakpoint
ALTER TABLE "stages" ADD COLUMN "cycle" integer DEFAULT 1 NOT NULL;