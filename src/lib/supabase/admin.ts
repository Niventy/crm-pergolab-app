import { createClient } from "@supabase/supabase-js";
import { cleServiceRole } from "@/lib/espace-client-config";

// Client Supabase SERVICE_ROLE — SERVEUR UNIQUEMENT (jamais dans un composant
// client : la clé contourne la RLS). Sert à l'espace client, qui n'a pas de
// session Supabase, pour signer les liens des documents PARTAGÉS (le contrôle
// d'accès est fait avant, par le jeton). Null si la clé n'est pas configurée.
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = cleServiceRole();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
