-- Étape « Annulée » (cycle 3, perdue) : une commande signée peut être annulée
-- (rétractation, financement refusé…) sans repasser par la prospection.
insert into "stages" ("nom", "position", "couleur", "cycle", "is_gagnee", "is_perdue")
select 'Annulée', 19, '#dc2626', 3, false, true
where not exists (select 1 from "stages" where "cycle" = 3 and "is_perdue" = true);--> statement-breakpoint

-- Clients déjà signés restés sur « Signée » (cycle 2) : ils démarrent le chantier
-- sur la 1ʳᵉ étape du cycle 3 (« À métrer »), comme le fait désormais la signature.
update "leads"
set "stage_id" = (
  select "id" from "stages"
  where "cycle" = 3 and "is_perdue" = false
  order by "position" asc limit 1
)
where "statut" = 'gagnee'
  and "deleted_at" is null
  and "stage_id" in (select "id" from "stages" where "is_gagnee" = true)
  and exists (select 1 from "stages" where "cycle" = 3 and "is_perdue" = false);
