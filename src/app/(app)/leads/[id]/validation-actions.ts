"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { echanges, leads, profiles, validationsChantier } from "@/db/schema";
import { currentUserId } from "@/lib/current-user";
import { lienActif } from "@/lib/espace-client";
import { creerLienEspaceClient } from "./espace-client-actions";
import { pointsPourLead } from "@/lib/chantier-validation-server";
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

// Demande au client de valider son chantier (chat de l'espace client). Fige les
// points présentés ; une demande en cours est remplacée. Crée le lien de
// l'espace client s'il n'existe pas (renvoyé pour être copié).
export async function demanderValidation(leadId: string) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "Non connecté." };
  const r = await pointsPourLead(leadId);
  if (!r.ok) return { ok: false as const, error: r.error };

  await db
    .update(validationsChantier)
    .set({ statut: "annulee" })
    .where(and(eq(validationsChantier.leadId, leadId), eq(validationsChantier.statut, "demandee")));
  await db.insert(validationsChantier).values({ leadId, points: r.points, schema: r.schema, demandeePar: userId });

  let jeton = (await lienActif(leadId))?.jeton ?? null;
  if (!jeton) {
    const c = await creerLienEspaceClient(leadId);
    if (!c.ok) return { ok: false as const, error: c.error };
    jeton = c.acces.jeton;
  }
  await db.insert(echanges).values({
    leadId,
    userId,
    type: "espace_client",
    contenu: `Validation du schéma de production demandée au client (${r.points.length} points)`,
  });
  revalidatePath(`/leads/${leadId}`);
  return { ok: true as const, error: null, jeton };
}

// Retire la demande en cours (ex. métré à refaire) : le chat disparaît de l'espace.
export async function annulerValidation(leadId: string) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "Non connecté." };
  const annulees = await db
    .update(validationsChantier)
    .set({ statut: "annulee" })
    .where(and(eq(validationsChantier.leadId, leadId), eq(validationsChantier.statut, "demandee")))
    .returning({ id: validationsChantier.id });
  if (annulees.length)
    await db.insert(echanges).values({
      leadId,
      userId,
      type: "espace_client",
      contenu: "Demande de validation du chantier retirée",
    });
  revalidatePath(`/leads/${leadId}`);
  return { ok: true as const, error: null };
}
