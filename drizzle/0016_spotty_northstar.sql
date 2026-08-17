CREATE TABLE "produits_catalogue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"description" text,
	"prix_ht" numeric(12, 2),
	"tva" numeric(5, 2) DEFAULT '20' NOT NULL,
	"categorie" text,
	"position" integer DEFAULT 0 NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
