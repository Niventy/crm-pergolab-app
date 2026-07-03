"use server";

import { eq, asc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { leads, stages, notes, echanges, profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { currentUserId } from "@/lib/current-user";
import { syncDevisPennylane } from "@/lib/pennylane";

// Marque un lead comme gagné : le place dans l'étape is_gagnee et fixe le statut.
export async function markGagnee(leadId: string) {
  const [stage] = await db.select().from(stages).where(eq(stages.isGagnee, true)).limit(1);
  await db
    .update(leads)
    .set({
      statut: "gagnee",
      dateSignature: sql`COALESCE(${leads.dateSignature}, CURRENT_DATE)`,
      updatedAt: new Date(),
      updatedBy: await currentUserId(),
      ...(stage ? { stageId: stage.id } : {}),
    })
    .where(eq(leads.id, leadId));
  // Devis Pennylane à la signature (échec silencieux si non configuré).
  try {
    await syncDevisPennylane(leadId);
  } catch (e) {
    console.error("Pennylane sync échouée:", e);
  }
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/kanban");
}

// Marque un lead comme perdu : le place dans l'étape is_perdue et fixe le statut.
export async function markPerdue(leadId: string) {
  const [stage] = await db.select().from(stages).where(eq(stages.isPerdue, true)).limit(1);
  await db
    .update(leads)
    .set({
      statut: "perdue",
      updatedAt: new Date(),
      updatedBy: await currentUserId(),
      ...(stage ? { stageId: stage.id } : {}),
    })
    .where(eq(leads.id, leadId));
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/kanban");
}

// Journalise une activité (pilule d'action rapide) + met à jour le champ lié.
export async function logActivite(
  leadId: string,
  type: string,
  options?: { label?: string; nextRelanceDate?: string },
) {
  const userId = await currentUserId();
  const label = options?.label?.trim() || null;

  await db.insert(echanges).values({
    leadId,
    userId,
    type,
    contenu: label,
  });

  // Effets de bord selon le type de pilule.
  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
    updatedBy: userId,
  };

  const aujourdhui = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  if (type === "appel") {
    // 1er contact : renseigné seulement s'il était vide.
    const [l] = await db
      .select({ d: leads.datePremierContact })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);
    if (!l?.d) updates.datePremierContact = new Date();
  } else if (type === "relance") {
    updates.relanceCount = sql`${leads.relanceCount} + 1`;
    if (options?.nextRelanceDate) updates.nextRelanceDate = options.nextRelanceDate;
  } else if (type === "rdv_honore") {
    updates.rdvStatut = "honore";
  } else if (type === "metre") {
    updates.dateMetre = aujourdhui;
  } else if (type === "commande") {
    updates.dateCommande = aujourdhui;
  } else if (type === "livre") {
    updates.dateLivraisonReelle = aujourdhui;
  } else if (type === "pose") {
    updates.datePoseReelle = aujourdhui;
  }

  await db.update(leads).set(updates).where(eq(leads.id, leadId));

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/kanban");
}

// Fait passer un lead à la 1ère étape d'un cycle (1=prospection, 2=devis, 3=pose).
export async function passerAuCycle(leadId: string, cycle: number) {
  const [stage] = await db
    .select()
    .from(stages)
    .where(eq(stages.cycle, cycle))
    .orderBy(asc(stages.position))
    .limit(1);
  if (!stage) return;

  const statut = stage.isPerdue
    ? "perdue"
    : stage.isGagnee || stage.cycle === 3
      ? "gagnee"
      : "en_cours";

  await db
    .update(leads)
    .set({
      stageId: stage.id,
      statut,
      ...(statut === "gagnee"
        ? { dateSignature: sql`COALESCE(${leads.dateSignature}, CURRENT_DATE)` }
        : {}),
      updatedAt: new Date(),
      updatedBy: await currentUserId(),
    })
    .where(eq(leads.id, leadId));

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/kanban");
}

// Poste un message dans la conversation, avec les profils @mentionnés.
export async function addMessage(
  leadId: string,
  contenu: string,
  mentions: string[],
) {
  const c = contenu.trim();
  if (!c) return { ok: false, error: "Message vide." };
  await db.insert(notes).values({
    leadId,
    userId: await currentUserId(),
    contenu: c,
    mentions: mentions.length ? mentions : null,
  });
  revalidatePath(`/leads/${leadId}`);
  return { ok: true, error: null };
}

// Déplace le lead vers une étape précise (depuis le rail de la fiche).
// Commentaire OBLIGATOIRE, sauf si l'étape cible est « Pas de réponse ».
// Journalise le déplacement (avec horodatage) dans l'activité.
export async function changerEtape(
  leadId: string,
  stageId: string,
  commentaire: string,
) {
  const userId = await currentUserId();
  const [stage] = await db
    .select()
    .from(stages)
    .where(eq(stages.id, stageId))
    .limit(1);
  if (!stage) return { ok: false as const, error: "Étape inconnue." };

  const c = (commentaire ?? "").trim();
  if (!c && stage.nom !== "Pas de réponse") {
    return { ok: false as const, error: "Commentaire obligatoire." };
  }

  const statut = stage.isPerdue
    ? "perdue"
    : stage.isGagnee || stage.cycle === 3
      ? "gagnee"
      : "en_cours";

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

  await db.insert(echanges).values({
    leadId,
    userId,
    type: "etape",
    contenu: `Déplacé en « ${stage.nom} »${c ? ` : ${c}` : ""}`,
  });

  // Signature (étape gagnée) → devis Pennylane (silencieux si non configuré).
  if (stage.isGagnee) {
    try {
      await syncDevisPennylane(leadId);
    } catch (e) {
      console.error("Pennylane sync échouée:", e);
    }
  }

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/kanban");
  revalidatePath("/liste");
  return { ok: true as const, error: null };
}

// Attribue / réassigne le lead à un responsable (ou null pour désassigner).
// Journalise QUI a attribué le lead (et à qui) dans l'activité.
export async function assignLead(leadId: string, assignedTo: string | null) {
  const userId = await currentUserId();
  await db
    .update(leads)
    .set({
      assignedTo: assignedTo || null,
      updatedAt: new Date(),
      updatedBy: userId,
    })
    .where(eq(leads.id, leadId));

  let contenu: string;
  if (!assignedTo) {
    contenu = "Attribution retirée";
  } else if (assignedTo === userId) {
    contenu = "S'est attribué le lead";
  } else {
    const [p] = await db
      .select({ nom: profiles.nom, email: profiles.email })
      .from(profiles)
      .where(eq(profiles.id, assignedTo))
      .limit(1);
    contenu = `Attribué à ${p?.nom ?? p?.email ?? "un membre"}`;
  }
  await db.insert(echanges).values({ leadId, userId, type: "attribution", contenu });

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/kanban");
  revalidatePath("/liste");
  revalidatePath("/dashboard");
}

export type NoteState = { error: string | null };

export async function addNote(
  leadId: string,
  _prev: NoteState,
  formData: FormData,
): Promise<NoteState> {
  const contenu = String(formData.get("contenu") ?? "").trim();
  if (!contenu) return { error: "La note est vide." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await db.insert(notes).values({
    leadId,
    userId: user?.id ?? null,
    contenu,
  });

  revalidatePath(`/leads/${leadId}`);
  return { error: null };
}
