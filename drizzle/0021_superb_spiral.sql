ALTER TABLE "devis" ADD COLUMN "montant_ttc" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "devis" ADD COLUMN "lignes" jsonb;--> statement-breakpoint
ALTER TABLE "devis" ADD COLUMN "accepte_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "factures" ADD COLUMN "montant_ttc" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "factures" ADD COLUMN "lignes" jsonb;