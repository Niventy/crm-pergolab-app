import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

// Renvoie l'id du profil connecté (= auth.users.id), ou null si non connecté.
export async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export type CurrentProfile = { id: string; email: string; role: string };

// Profil complet du connecté (avec son rôle : "admin" ou "membre").
export async function currentProfile(): Promise<CurrentProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [p] = await db
    .select({ id: profiles.id, email: profiles.email, role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  // Par défaut : accès restreint (membre), jamais admin par accident.
  return p ?? { id: user.id, email: user.email ?? "", role: "membre" };
}

// L'admin voit les chiffres sensibles (CA global, marge, trésorerie, perf ADV).
export async function isAdmin(): Promise<boolean> {
  const p = await currentProfile();
  return p?.role === "admin";
}
