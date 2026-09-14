CREATE TABLE "options_configurateur" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"type" text DEFAULT 'surface' NOT NULL,
	"prix" numeric(12, 2) DEFAULT '0' NOT NULL,
	"forfait" numeric(12, 2),
	"def_l" numeric(8, 3),
	"def_h" numeric(8, 3),
	"position" integer DEFAULT 0 NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
