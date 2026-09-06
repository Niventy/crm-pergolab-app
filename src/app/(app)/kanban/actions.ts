"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { leads, stages, echanges } from "@/db/schema";
import { currentUserId } from "@/lib/current-user";
import { autoAccepterDevisSiUnique } from "@/lib/devis-accepte";
import { statutPourStage } from "@/lib/pipeline";
import { etapeEffective, libelleDeplacement } from "@/lib/pipeline-server";
import { changerEtape } from "@/app/(app)/leads/[id]/actions";

// Déplace un lead vers une autre étape. Met à jour le statut gagnée/perdue
// selon les drapeaux de l'étape cible, et journalise le déplacement dans
// l'activité (comme le rail de la fiche, mais sans commentaire).
// Dépôt sur « Signée » ⇒ la fiche démarre le chantier (1ʳᵉ étape du cycle 3).
export async function updateLeadStage(leadId: string, stageId: string) {
  const [demandee] = await db
    .select()
    .from(stages)
    .where(eq(stages.id, stageId))
    .limit(1);

  if (!demandee) {
    return { error: "Étape introuvable." };
  }
  const stage = await etapeEffective(demandee);

  // L'étape actuelle (pour ne pas journaliser un faux déplacement).
  const [avant] = await db
    .select({ stageId: leads.stageId })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);

  // Signature = gagnée même si l'étape effective est une étape de chantier.
  const statut = demandee.isGagnee ? "gagnee" : statutPourStage(stage);

  const userId = await currentUserId();

  await db
    .update(leads)
    .set({
      stageId: stage.id,
      statut,
      ...(statut === "gagnee"
        ? { dateSignature: sql`COALESCE(${leads.dateSignature}, CURRENT_DATE)` }
        : {}),
      updatedAt: new Date(),
      updatedBy: userId,
    })
    .where(eq(leads.id, leadId));

  if (avant?.stageId !== stage.id) {
    await db.insert(echanges).values({
      leadId,
      userId,
      type: "etape",
      contenu: `${libelleDeplacement(demandee, stage)} (Kanban)`,
    });
  }

  // Signature : le devis unique devient le devis accepté (base de facturation).
  if (statut === "gagnee") await autoAccepterDevisSiUnique(leadId);

  revalidatePath("/kanban");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/liste");
  revalidatePath("/clients", "layout"); // revalide Kanban clients / Tableau
  return { error: null };
}

// Dépôt sur une étape PERDUE depuis le Kanban : la raison de perte est requise
// (elle alimente les statistiques), le commentaire est libre.
export async function perdreLead(
  leadId: string,
  stageId: string,
  raison: string,
  commentaire: string,
) {
  const c = commentaire.trim() || "Perdu (Kanban)";
  const r = await changerEtape(leadId, stageId, c, raison);
  if (r.ok) revalidatePath("/kanban");
  return r;
}
