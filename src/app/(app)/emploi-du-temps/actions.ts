"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { taches } from "@/db/schema";
import { currentUserId } from "@/lib/current-user";

// Ajoute une tâche pour la personne connectée (rattachable à un lead).
export async function addTache(
  titre: string,
  echeance: string | null,
  leadId?: string | null,
) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "Non connecté." };
  const t = titre.trim();
  if (!t) return { ok: false as const, error: "Titre vide." };
  await db.insert(taches).values({
    userId,
    titre: t,
    echeance: echeance || null,
    leadId: leadId || null,
  });
  revalidatePath("/emploi-du-temps");
  return { ok: true as const, error: null };
}

// Coche / décoche une tâche (uniquement les siennes).
export async function toggleTache(id: string, fait: boolean) {
  const userId = await currentUserId();
  if (!userId) return;
  await db
    .update(taches)
    .set({ fait, faitAt: fait ? new Date() : null })
    .where(and(eq(taches.id, id), eq(taches.userId, userId)));
  revalidatePath("/emploi-du-temps");
}

// Supprime une tâche (uniquement les siennes).
export async function deleteTache(id: string) {
  const userId = await currentUserId();
  if (!userId) return;
  await db
    .delete(taches)
    .where(and(eq(taches.id, id), eq(taches.userId, userId)));
  revalidatePath("/emploi-du-temps");
}
