"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { echanges, leads, profiles, validationsChantier } from "@/db/schema";
import { currentUserId } from "@/lib/current-user";
import type { Metre } from "@/lib/chantier-validation";

const entierMm = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 && n < 100_000 ? n : null;
};

// Enregistre le métré structuré (saisi par le métreur / l'ADV).
export async function enregistrerMetre(leadId: string, data: Metre) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "Non connecté." };
  const [moi] = await db
    .select({ nom: profiles.nom, email: profiles.email })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  const metre: Metre = {
    largeurMm: entierMm(data.largeurMm),
    avanceeMm: entierMm(data.avanceeMm),
    hauteurMm: entierMm(data.hauteurMm),
    pose: data.pose === "adossee" || data.pose === "autoportee" ? data.pose : null,
    remarques: data.remarques?.trim() || null,
    saisiAt: new Date().toISOString(),
    saisiPar: moi?.nom ?? moi?.email ?? null,
  };
  if (!metre.largeurMm || !metre.avanceeMm || !metre.pose)
    return { ok: false as const, error: "Largeur, avancée et pose sont obligatoires." };

  await db
    .update(leads)
    .set({ metre, updatedAt: new Date(), updatedBy: userId })
    .where(eq(leads.id, leadId));
  await db.insert(echanges).values({
    leadId,
    userId,
    type: "metre",
    contenu: `Métré : ${metre.largeurMm} × ${metre.avanceeMm} mm${metre.hauteurMm ? ` × H ${metre.hauteurMm}` : ""}, ${metre.pose === "adossee" ? "adossée" : "autoportée"}`,
  });
  revalidatePath(`/leads/${leadId}`);
  return { ok: true as const, error: null };
}

// Rouvre le configurateur du client (ex. écart à corriger, nouveau métré) : le
// schéma validé est archivé (« annulee ») ; le client retrouve sa dernière
// configuration, à revoir puis revalider.
export async function rouvrirConfiguration(leadId: string) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "Non connecté." };
  const rouvertes = await db
    .update(validationsChantier)
    .set({ statut: "annulee" })
    .where(and(eq(validationsChantier.leadId, leadId), ne(validationsChantier.statut, "annulee")))
    .returning({ id: validationsChantier.id });
  if (rouvertes.length)
    await db.insert(echanges).values({
      leadId,
      userId,
      type: "espace_client",
      contenu: "Configuration du client rouverte : schéma de production à revalider",
    });
  revalidatePath(`/leads/${leadId}`);
  return { ok: true as const, error: null };
}
