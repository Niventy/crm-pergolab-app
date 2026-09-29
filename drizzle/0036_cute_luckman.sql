CREATE TABLE "poseurs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"telephone" text,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "poseur_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_poseur_id_poseurs_id_fk" FOREIGN KEY ("poseur_id") REFERENCES "public"."poseurs"("id") ON DELETE set null ON UPDATE no action;