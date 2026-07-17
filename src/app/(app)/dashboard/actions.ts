"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { isAdmin } from "@/lib/current-user";

// Fixe l'objectif de CA mensuel d'un ADV. Réservé aux admins (vérifié serveur).
export async function setObjectifMensuel(profileId: string, montant: string) {
  if (!(await isAdmin()))
    return { ok: false as const, error: "Réservé aux admins." };

  const v = montant.trim();
  await db
    .update(profiles)
    .set({ objectifMensuel: v === "" ? null : v })
    .where(eq(profiles.id, profileId));

  revalidatePath("/dashboard");
  return { ok: true as const, error: null };
}
