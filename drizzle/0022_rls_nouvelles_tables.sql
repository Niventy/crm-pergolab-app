-- RLS sur les tables créées après setup-rls.ts. Sans ces politiques, la clé anon
-- (publique, embarquée dans le front) permettait de lire/écrire ces tables via
-- l'API REST Supabase. L'app passe par Drizzle (connexion directe, hors RLS) :
-- ces règles ne changent rien à son fonctionnement, elles ferment la porte REST.
alter table public.factures enable row level security;--> statement-breakpoint
alter table public.documents enable row level security;--> statement-breakpoint
alter table public.notifications enable row level security;--> statement-breakpoint
alter table public.taches enable row level security;--> statement-breakpoint
alter table public.produits_catalogue enable row level security;--> statement-breakpoint
alter table public.sur_mesure_mapping enable row level security;--> statement-breakpoint

-- Données d'équipe : accès complet aux membres authentifiés (équipe de confiance).
drop policy if exists "factures_all_authenticated" on public.factures;--> statement-breakpoint
create policy "factures_all_authenticated"
  on public.factures for all to authenticated using (true) with check (true);--> statement-breakpoint

drop policy if exists "documents_all_authenticated" on public.documents;--> statement-breakpoint
create policy "documents_all_authenticated"
  on public.documents for all to authenticated using (true) with check (true);--> statement-breakpoint

drop policy if exists "produits_catalogue_all_authenticated" on public.produits_catalogue;--> statement-breakpoint
create policy "produits_catalogue_all_authenticated"
  on public.produits_catalogue for all to authenticated using (true) with check (true);--> statement-breakpoint

drop policy if exists "sur_mesure_mapping_all_authenticated" on public.sur_mesure_mapping;--> statement-breakpoint
create policy "sur_mesure_mapping_all_authenticated"
  on public.sur_mesure_mapping for all to authenticated using (true) with check (true);--> statement-breakpoint

-- Données personnelles : chacun ne voit que les siennes.
drop policy if exists "notifications_own" on public.notifications;--> statement-breakpoint
create policy "notifications_own"
  on public.notifications for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);--> statement-breakpoint

drop policy if exists "taches_own" on public.taches;--> statement-breakpoint
create policy "taches_own"
  on public.taches for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
