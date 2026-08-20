"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { leads, stages, echanges } from "@/db/schema";
import { currentUserId } from "@/lib/current-user";

// Déplace un lead vers une autre étape. Met à jour le statut gagnée/perdue
// selon les drapeaux de l'étape cible, et journalise le déplacement dans
// l'activité (comme le rail de la fiche, mais sans commentaire).
export async function updateLeadStage(leadId: string, stageId: string) {
  const [stage] = await db
    .select()
    .from(stages)
    .where(eq(stages.id, stageId))
    .limit(1);

  if (!stage) {
    return { error: "Étape introuvable." };
  }

  // L'étape actuelle (pour ne pas journaliser un faux déplacement).
  const [avant] = await db
    .select({ stageId: leads.stageId })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);

  const statut = stage.isPerdue
    ? "perdue"
    : stage.isGagnee || stage.cycle === 3
      ? "gagnee"
      : "en_cours";

  const userId = await currentUserId();

  await db
    .update(leads)
    .set({
      stageId,
      statut,
      ...(statut === "gagnee"
        ? { dateSignature: sql`COALESCE(${leads.dateSignature}, CURRENT_DATE)` }
        : {}),
      updatedAt: new Date(),
      updatedBy: userId,
    })
    .where(eq(leads.id, leadId));

  if (avant?.stageId !== stageId) {
    await db.insert(echanges).values({
      leadId,
      userId,
      type: "etape",
      contenu: `Déplacé en « ${stage.nom} » (Kanban)`,
    });
  }

  revalidatePath("/kanban");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/liste");
  revalidatePath("/clients/chantiers");
  return { error: null };
}
