import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

// Crée un trigger sur auth.users : à chaque nouvel utilisateur Supabase Auth,
// une ligne correspondante est insérée dans public.profiles.
// Rend l'invitation manuelle (Authentication > Users > Add user) fonctionnelle.
const SQL = `
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, nom)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'nom',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
`;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL n'est pas défini. Renseignez .env.local.");
  }

  const client = postgres(connectionString, { prepare: false, max: 1 });

  console.log("Installation du trigger auth.users -> profiles…");
  await client.unsafe(SQL);
  console.log("✓ Trigger installé.");

  // Backfill : crée les profils manquants pour les utilisateurs déjà existants.
  const inserted = await client.unsafe(`
    insert into public.profiles (id, email, nom)
    select u.id, u.email, split_part(u.email, '@', 1)
    from auth.users u
    left join public.profiles p on p.id = u.id
    where p.id is null
    returning id;
  `);
  console.log(`✓ ${inserted.length} profil(s) existant(s) synchronisé(s).`);

  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Erreur lors de l'installation du trigger :", err);
  process.exit(1);
});
