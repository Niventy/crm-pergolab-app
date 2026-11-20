-- Réglages globaux (infos entreprise de l'espace client…) : RLS comme les autres
-- tables de réglages (l'app passe par Drizzle ; REST anonyme fermée).
alter table public.parametres enable row level security;--> statement-breakpoint
drop policy if exists "parametres_all_authenticated" on public.parametres;--> statement-breakpoint
create policy "parametres_all_authenticated"
  on public.parametres for all to authenticated using (true) with check (true);
