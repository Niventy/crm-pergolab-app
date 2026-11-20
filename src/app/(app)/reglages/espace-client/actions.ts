"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { parametres } from "@/db/schema";
import { currentUserId } from "@/lib/current-user";
import { CLE_INFOS_ESPACE, lireInfos, type InfosEntreprise } from "@/lib/infos-entreprise";

// Enregistre les infos affichées dans l'espace client (contacts, SIRET, conditions…).
export async function enregistrerInfosEspace(data: InfosEntreprise) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "Non connecté." };
  const valeur = lireInfos(data); // nettoyage / bornes
  await db
    .insert(parametres)
    .values({ cle: CLE_INFOS_ESPACE, valeur, updatedBy: userId })
    .onConflictDoUpdate({
      target: parametres.cle,
      set: { valeur, updatedAt: new Date(), updatedBy: userId },
    });
  revalidatePath("/reglages/espace-client");
  return { ok: true as const, error: null };
}
