CREATE TABLE "paiements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"date" date NOT NULL,
	"montant" numeric(12, 2) NOT NULL,
	"mode" text DEFAULT 'virement' NOT NULL,
	"reference" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- RLS (même règle que les autres données d'équipe).
alter table public.paiements enable row level security;--> statement-breakpoint
drop policy if exists "paiements_all_authenticated" on public.paiements;--> statement-breakpoint
create policy "paiements_all_authenticated"
  on public.paiements for all to authenticated using (true) with check (true);--> statement-breakpoint
-- Reprise des encaissements déjà saisis (un paiement « report » par champ),
-- uniquement pour les fiches sans historique de paiements (idempotent).
insert into "paiements" ("lead_id", "date", "montant", "mode", "reference")
select l."id", coalesce(l."date_signature", l."created_at"::date), l."acompte_encaisse", 'virement',
       'Report « acompte encaissé » (avant l''historique des paiements)'
from "leads" l
where l."acompte_encaisse" is not null and l."acompte_encaisse" > 0
  and not exists (select 1 from "paiements" p where p."lead_id" = l."id");--> statement-breakpoint
insert into "paiements" ("lead_id", "date", "montant", "mode", "reference")
select l."id", coalesce(l."date_signature", l."created_at"::date), l."paiement_espece", 'especes',
       'Report « paiement espèces » (avant l''historique des paiements)'
from "leads" l
where l."paiement_espece" is not null and l."paiement_espece" > 0
  and not exists (select 1 from "paiements" p where p."lead_id" = l."id" and p."mode" = 'especes');
