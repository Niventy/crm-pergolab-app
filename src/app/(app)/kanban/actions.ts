"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { leads, stages } from "@/db/schema";
import { currentUserId } from "@/lib/current-user";

// Déplace un lead vers une autre étape. Met à jour le statut gagnée/perdue
// selon les drapeaux de l'étape cible.
export async function updateLeadStage(leadId: string, stageId: string) {
  const [stage] = await db
    .select()
    .from(stages)
    .where(eq(stages.id, stageId))
    .limit(1);

  if (!stage) {
    return { error: "Étape introuvable." };
  }

  const statut = stage.isPerdue
    ? "perdue"
    : stage.isGagnee || stage.cycle === 3
      ? "gagnee"
      : "en_cours";

  await db
    .update(leads)
    .set({
      stageId,
      statut,
      ...(statut === "gagnee"
        ? { dateSignature: sql`COALESCE(${leads.dateSignature}, CURRENT_DATE)` }
        : {}),
      updatedAt: new Date(),
      updatedBy: await currentUserId(),
    })
    .where(eq(leads.id, leadId));

  revalidatePath("/kanban");
  return { error: null };
}
