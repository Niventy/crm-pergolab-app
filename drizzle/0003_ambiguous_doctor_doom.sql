CREATE TYPE "public"."mode_paiement" AS ENUM('comptant', 'financement_60', 'financement_120');--> statement-breakpoint
CREATE TYPE "public"."raison_perte" AS ENUM('prix', 'delai', 'concurrent', 'injoignable', 'annule', 'non_qualifie', 'autre');--> statement-breakpoint
CREATE TYPE "public"."type_pose" AS ENUM('autoportee', 'adossee');--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "date_premier_contact" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "raison_perte" "raison_perte";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "mode_paiement" "mode_paiement";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "acompte" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "montant_achat" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "gamme" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "dimensions" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "finition" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "options" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "type_pose" "type_pose";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "pose_assigned_to" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "date_metre" date;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "fournisseur" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ref_commande" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "date_commande" date;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "date_livraison_prevue" date;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "date_livraison_reelle" date;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "date_pose_prevue" date;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "date_pose_reelle" date;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "adresse_pose" text;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_pose_assigned_to_profiles_id_fk" FOREIGN KEY ("pose_assigned_to") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;