"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { leads, echanges } from "@/db/schema";
import { currentUserId } from "@/lib/current-user";
import { stageEntree } from "@/lib/pipeline-server";

export type NouveauProspect = {
  nom: string;
  telephone?: string | null;
  email?: string | null;
  entreprise?: string | null;
  codePostal?: string | null;
  ville?: string | null;
  typeProjet?: string | null;
  dimensions?: string | null;
  montant?: string | null;
  source?: string | null;
  assignedTo?: string | null;
};

// Crée un prospect À LA MAIN (hors webhook Meta). Il entre dans « À traiter »,
// statut en_cours, source « Manuel » par défaut. Journalise la création.
export async function creerProspect(input: NouveauProspect) {
  const nom = (input.nom ?? "").trim();
  if (!nom)
    return {
      ok: false as const,
      error: "Le nom est obligatoire.",
      leadId: null as string | null,
    };

  const userId = await currentUserId();

  // Étape d'entrée : « À traiter » (par clé stable, sinon 1ère du cycle 1).
  const stage = await stageEntree();

  const num = (v?: string | null) => {
    const t = (v ?? "").toString().trim().replace(",", ".");
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? String(n) : null;
  };
  const txt = (v?: string | null) => {
    const t = (v ?? "").toString().trim();
    return t === "" ? null : t;
  };

  const [created] = await db
    .insert(leads)
    .values({
      stageId: stage?.id ?? null,
      assignedTo: input.assignedTo || null,
      statut: "en_cours",
      nom,
      telephone: txt(input.telephone),
      email: txt(input.email),
      entreprise: txt(input.entreprise),
      codePostal: txt(input.codePostal),
      ville: txt(input.ville),
      typeProjet: txt(input.typeProjet),
      dimensions: txt(input.dimensions),
      montant: num(input.montant),
      source: txt(input.source) ?? "Manuel",
      updatedAt: new Date(),
      updatedBy: userId,
    })
    .returning({ id: leads.id });

  if (created?.id) {
    await db.insert(echanges).values({
      leadId: created.id,
      userId,
      type: "creation",
      contenu: "Prospect créé manuellement",
    });
  }

  revalidatePath("/kanban");
  revalidatePath("/liste");
  revalidatePath("/dashboard");
  return { ok: true as const, error: null, leadId: created?.id ?? null };
}
