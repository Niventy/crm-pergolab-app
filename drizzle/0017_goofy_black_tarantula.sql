ALTER TABLE "leads" ADD COLUMN "montant_ttc" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "acompte_encaisse" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "paiement_espece" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "financeur" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "equipe_pose" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "mesure" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "facture_solde_client" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "facture_solde_poseur" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "dossier_date_envoi" date;