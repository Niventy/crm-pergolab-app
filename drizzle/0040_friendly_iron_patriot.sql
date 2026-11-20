CREATE TABLE "validations_chantier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"statut" text DEFAULT 'demandee' NOT NULL,
	"points" jsonb NOT NULL,
	"reponses" jsonb,
	"demandee_at" timestamp with time zone DEFAULT now() NOT NULL,
	"demandee_par" uuid,
	"repondu_at" timestamp with time zone,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "partage" text DEFAULT 'interne' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "metre" jsonb;--> statement-breakpoint
ALTER TABLE "validations_chantier" ADD CONSTRAINT "validations_chantier_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validations_chantier" ADD CONSTRAINT "validations_chantier_demandee_par_profiles_id_fk" FOREIGN KEY ("demandee_par") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;