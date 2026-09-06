import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

// Active la Row Level Security sur toutes les tables et crée les politiques.
// Règle métier : seuls les membres authentifiés accèdent aux données.
// (Équipe restreinte et de confiance -> accès partagé à tous les leads.)
//
// - role `anon`          : aucun accès (RLS sans politique = tout bloqué).
// - role `authenticated` : accès complet aux données métier.
// - role `service_role`  : contourne la RLS (webhook entrant, étape 7).
// - profiles : lecture pour tous les membres, modification de sa propre fiche.
const SQL = `
-- Activer la RLS
alter table public.profiles enable row level security;
alter table public.stages   enable row level security;
alter table public.leads    enable row level security;
alter table public.notes    enable row level security;
alter table public.echanges enable row level security;
alter table public.devis    enable row level security;

-- profiles : lecture par tous les membres, écriture sur sa propre fiche
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select to authenticated using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- stages : accès complet aux membres
drop policy if exists "stages_all_authenticated" on public.stages;
create policy "stages_all_authenticated"
  on public.stages for all to authenticated using (true) with check (true);

-- leads : accès complet aux membres
drop policy if exists "leads_all_authenticated" on public.leads;
create policy "leads_all_authenticated"
  on public.leads for all to authenticated using (true) with check (true);

-- notes : accès complet aux membres
drop policy if exists "notes_all_authenticated" on public.notes;
create policy "notes_all_authenticated"
  on public.notes for all to authenticated using (true) with check (true);

-- echanges : accès complet aux membres
drop policy if exists "echanges_all_authenticated" on public.echanges;
create policy "echanges_all_authenticated"
  on public.echanges for all to authenticated using (true) with check (true);

-- devis : accès complet aux membres
drop policy if exists "devis_all_authenticated" on public.devis;
create policy "devis_all_authenticated"
  on public.devis for all to authenticated using (true) with check (true);

-- Tables ajoutées ensuite (aussi couvertes par la migration 0022, idempotent).
alter table public.factures           enable row level security;
alter table public.documents          enable row level security;
alter table public.notifications      enable row level security;
alter table public.taches             enable row level security;
alter table public.produits_catalogue enable row level security;
alter table public.sur_mesure_mapping enable row level security;
alter table public.paiements          enable row level security;

drop policy if exists "paiements_all_authenticated" on public.paiements;
create policy "paiements_all_authenticated"
  on public.paiements for all to authenticated using (true) with check (true);
drop policy if exists "factures_all_authenticated" on public.factures;
create policy "factures_all_authenticated"
  on public.factures for all to authenticated using (true) with check (true);
drop policy if exists "documents_all_authenticated" on public.documents;
create policy "documents_all_authenticated"
  on public.documents for all to authenticated using (true) with check (true);
drop policy if exists "produits_catalogue_all_authenticated" on public.produits_catalogue;
create policy "produits_catalogue_all_authenticated"
  on public.produits_catalogue for all to authenticated using (true) with check (true);
drop policy if exists "sur_mesure_mapping_all_authenticated" on public.sur_mesure_mapping;
create policy "sur_mesure_mapping_all_authenticated"
  on public.sur_mesure_mapping for all to authenticated using (true) with check (true);

-- Données personnelles : chacun ne voit que les siennes.
drop policy if exists "notifications_own" on public.notifications;
create policy "notifications_own"
  on public.notifications for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "taches_own" on public.taches;
create policy "taches_own"
  on public.taches for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
`;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL n'est pas défini. Renseignez .env.local.");
  }

  const client = postgres(connectionString, { prepare: false, max: 1 });

  console.log("Activation de la RLS et création des politiques…");
  await client.unsafe(SQL);

  // Vérification : liste l'état RLS des tables du schéma public.
  const rows = await client.unsafe(`
    select c.relname as table, c.relrowsecurity as rls_enabled,
           count(p.policyname) as policies
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_policies p on p.tablename = c.relname and p.schemaname = 'public'
    where n.nspname = 'public'
      and c.relname in ('profiles','stages','leads','notes','echanges','devis',
                        'factures','documents','notifications','taches',
                        'produits_catalogue','sur_mesure_mapping','paiements')
    group by c.relname, c.relrowsecurity
    order by c.relname;
  `);

  console.log("État RLS :");
  for (const r of rows) {
    console.log(
      `  • ${r.table}: RLS=${r.rls_enabled ? "ON" : "OFF"}, ${r.policies} politique(s)`,
    );
  }

  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Erreur lors de l'activation de la RLS :", err);
  process.exit(1);
});
