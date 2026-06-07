import { createClient } from "@/lib/supabase/server";

// Renvoie l'id du profil connecté (= auth.users.id), ou null si non connecté.
export async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}
