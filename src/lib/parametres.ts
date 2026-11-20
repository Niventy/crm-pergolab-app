import { eq } from "drizzle-orm";
import { db } from "@/db";
import { parametres } from "@/db/schema";
import { CLE_INFOS_ESPACE, lireInfos, type InfosEntreprise } from "@/lib/infos-entreprise";

// Infos de l'entreprise affichées dans l'espace client (Réglages → Espace client).
export async function getInfosEntreprise(): Promise<InfosEntreprise> {
  const [row] = await db
    .select({ valeur: parametres.valeur })
    .from(parametres)
    .where(eq(parametres.cle, CLE_INFOS_ESPACE))
    .limit(1);
  return lireInfos(row?.valeur ?? null);
}
