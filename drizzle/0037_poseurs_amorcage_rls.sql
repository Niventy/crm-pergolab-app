-- Liste des poseurs : RLS comme les autres tables (l'app passe par Drizzle ; la
-- REST anonyme est fermée) + amorçage depuis ce que l'équipe saisissait en texte
-- libre dans « Équipe de pose » (« BENJ 04 AOUT », « SEB 28/07/2026 »…).
-- Les noms sont repris tels que saisis ; ils se renomment dans Réglages → Poseurs.
alter table public.poseurs enable row level security;--> statement-breakpoint
drop policy if exists "poseurs_all_authenticated" on public.poseurs;--> statement-breakpoint
create policy "poseurs_all_authenticated"
  on public.poseurs for all to authenticated using (true) with check (true);--> statement-breakpoint
INSERT INTO "poseurs" ("nom")
SELECT v.nom FROM (VALUES ('Benj'), ('Seb')) AS v(nom)
WHERE NOT EXISTS (SELECT 1 FROM "poseurs");--> statement-breakpoint
-- Rattachement des fiches existantes. `equipe_pose` est CONSERVÉ tel quel (il
-- porte aussi des dates / précisions) : on ne fait que renseigner `poseur_id`.
UPDATE "leads" SET "poseur_id" = (SELECT "id" FROM "poseurs" WHERE "nom" = 'Benj' LIMIT 1)
WHERE "poseur_id" IS NULL AND "equipe_pose" ~* '^\s*benj?\M';--> statement-breakpoint
UPDATE "leads" SET "poseur_id" = (SELECT "id" FROM "poseurs" WHERE "nom" = 'Seb' LIMIT 1)
WHERE "poseur_id" IS NULL AND "equipe_pose" ~* '^\s*seb\M';
