CREATE TABLE "parametres" (
	"cle" text PRIMARY KEY NOT NULL,
	"valeur" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "acces_client" ADD COLUMN "dernier_envoi_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "parametres" ADD CONSTRAINT "parametres_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;