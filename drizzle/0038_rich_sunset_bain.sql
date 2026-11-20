CREATE TABLE "acces_client" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"jeton" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"derniere_visite" timestamp with time zone,
	"nb_visites" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "acces_client_jeton_unique" UNIQUE("jeton")
);
--> statement-breakpoint
ALTER TABLE "acces_client" ADD CONSTRAINT "acces_client_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acces_client" ADD CONSTRAINT "acces_client_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;