import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

// Prépare le stockage des documents SANS clé service_role : via la connexion
// Postgres directe (DATABASE_URL), on crée le bucket « documents » (privé) et
// les politiques RLS autorisant les membres authentifiés à y déposer/lire/
// supprimer leurs fichiers. Idempotent.
async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

  // Bucket privé « documents ».
  await sql`
    insert into storage.buckets (id, name, public)
    values ('documents', 'documents', false)
    on conflict (id) do nothing
  `;

  // Politique : accès complet au bucket pour les authentifiés (équipe de confiance).
  await sql`drop policy if exists "documents_all_authenticated" on storage.objects`;
  await sql`
    create policy "documents_all_authenticated"
      on storage.objects for all to authenticated
      using (bucket_id = 'documents')
      with check (bucket_id = 'documents')
  `;

  console.log("Bucket « documents » + politiques prêts.");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
