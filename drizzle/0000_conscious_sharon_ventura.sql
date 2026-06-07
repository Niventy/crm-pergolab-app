CREATE TYPE "public"."echange_type" AS ENUM('appel', 'email', 'rdv');--> statement-breakpoint
CREATE TYPE "public"."lead_statut" AS ENUM('en_cours', 'gagnee', 'perdue');--> statement-breakpoint
CREATE TYPE "public"."rdv_statut" AS ENUM('prevu', 'a_reprogrammer', 'honore');--> statement-breakpoint
CREATE TYPE "public"."rdv_type" AS ENUM('physique', 'visio');--> statement-breakpoint
CREATE TABLE "devis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"numero" text,
	"montant" numeric(12, 2),
	"statut" text,
	"lien_externe" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "echanges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"user_id" uuid,
	"type" "echange_type" NOT NULL,
	"contenu" text,
	"date" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stage_id" uuid,
	"assigned_to" uuid,
	"nom" text NOT NULL,
	"entreprise" text,
	"email" text,
	"telephone" text,
	"source" text,
	"campagne" text,
	"montant" numeric(12, 2),
	"probabilite" integer,
	"objectif_date" date,
	"type_projet" text,
	"code_postal" text,
	"date_installation" date,
	"date_souhaitee_appel" date,
	"statut" "lead_statut" DEFAULT 'en_cours' NOT NULL,
	"rdv_date" date,
	"rdv_type" "rdv_type",
	"rdv_statut" "rdv_statut",
	"next_relance_date" date,
	"relance_count" integer DEFAULT 0 NOT NULL,
	"raw_payload" jsonb
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"user_id" uuid,
	"contenu" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"nom" text,
	"role" text DEFAULT 'membre' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"position" integer NOT NULL,
	"couleur" text DEFAULT '#94a3b8' NOT NULL,
	"is_gagnee" boolean DEFAULT false NOT NULL,
	"is_perdue" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "devis" ADD CONSTRAINT "devis_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "echanges" ADD CONSTRAINT "echanges_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "echanges" ADD CONSTRAINT "echanges_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_profiles_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;