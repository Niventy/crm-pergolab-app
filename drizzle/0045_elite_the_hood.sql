ALTER TABLE "documents" ADD COLUMN "categorie" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "date_livraison_prevue_fin" date;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "perdu_at" timestamp with time zone;