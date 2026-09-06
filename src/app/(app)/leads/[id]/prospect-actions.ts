"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { echanges, leads, stages } from "@/db/schema";
import { currentUserId } from "@/lib/current-user";
import { STAGE, type StageCode } from "@/lib/pipeline";
import { stageParCode } from "@/lib/pipeline-server";
import { syncRdvAgenda } from "@/lib/rdv-agenda";
import { formatDate } from "@/lib/format";

// Actions « un clic » de la prospection : ce que l'ADV fait 20 fois par jour au
// téléphone. Chacune journalise, met à jour les champs liés et déplace l'étape
// quand ça a du sens — plus besoin d'ouvrir la page Modifier.

function revalider(leadId: string) {
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/kanban");
  revalidatePath("/liste");
  revalidatePath("/emploi-du-temps");
  revalidatePath("/dashboard");
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Déplace vers une étape (par code) si la fiche est en cours et que ça change
// quelque chose. `seulementEnAvant` : ne recule jamais (ex. Devis à envoyer).
async function deplacer(
  leadId: string,
  code: StageCode,
  userId: string | null,
  opts: { seulementEnAvant?: boolean; motif?: string } = {},
) {
  const [lead] = await db
    .select({ stageId: leads.stageId, statut: leads.statut })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
  if (!lead || lead.statut !== "en_cours") return false;
  const cible = await stageParCode(code);
  if (!cible || cible.id === lead.stageId) return false;
  if (opts.seulementEnAvant && lead.stageId) {
    const [actuelle] = await db.select().from(stages).where(eq(stages.id, lead.stageId)).limit(1);
    if (actuelle && actuelle.position >= cible.position) return false;
  }
  await db.update(leads).set({ stageId: cible.id }).where(eq(leads.id, leadId));
  await db.insert(echanges).values({
    leadId,
    userId,
    type: "etape",
    contenu: `Déplacé en « ${cible.nom} »${opts.motif ? ` (${opts.motif})` : ""}`,
  });
  return true;
}

// Appel sans réponse : journalise la tentative, marque le 1er contact tenté,
// passe en « Pas de réponse » et programme la relance (par défaut +2 j).
export async function pasDeReponse(leadId: string, relanceDate: string | null) {
  const userId = await currentUserId();
  if (relanceDate && !DATE_RE.test(relanceDate))
    return { ok: false as const, error: "Date de relance invalide." };

  await db.insert(echanges).values({
    leadId,
    userId,
    type: "appel",
    contenu: `Appel — pas de réponse${relanceDate ? ` · rappel le ${formatDate(relanceDate)}` : ""}`,
  });
  await db
    .update(leads)
    .set({
      datePremierContact: sql`COALESCE(${leads.datePremierContact}, now())`,
      ...(relanceDate ? { nextRelanceDate: relanceDate } : {}),
      updatedAt: new Date(),
      updatedBy: userId,
    })
    .where(eq(leads.id, leadId));
  await deplacer(leadId, STAGE.PAS_DE_REPONSE, userId, { motif: "pas de réponse" });
  revalider(leadId);
  return { ok: true as const, error: null };
}

// RDV fixé (ou modifié) : date / heure / type → fiche à jour, étape « Rendez-vous »
// (jamais en arrière), évènement Google Agenda créé ou mis à jour (client invité).
export async function fixerRdv(
  leadId: string,
  data: { date: string; heure?: string | null; type: "physique" | "visio" },
) {
  const userId = await currentUserId();
  if (!DATE_RE.test(data.date)) return { ok: false as const, error: "Date invalide." };
  const heure = data.heure?.trim() || null;
  if (heure && !/^\d{2}:\d{2}$/.test(heure))
    return { ok: false as const, error: "Heure invalide (HH:MM)." };
  const type = data.type === "visio" ? "visio" : "physique";

  await db
    .update(leads)
    .set({
      rdvDate: data.date,
      rdvHeure: heure,
      rdvType: type,
      rdvStatut: "prevu",
      datePremierContact: sql`COALESCE(${leads.datePremierContact}, now())`,
      updatedAt: new Date(),
      updatedBy: userId,
    })
    .where(eq(leads.id, leadId));
  await db.insert(echanges).values({
    leadId,
    userId,
    type: "rdv",
    contenu: `RDV fixé le ${formatDate(data.date)}${heure ? ` à ${heure}` : ""} (${type})`,
  });
  await deplacer(leadId, STAGE.RENDEZ_VOUS, userId, { seulementEnAvant: true, motif: "RDV fixé" });
  const agenda = await syncRdvAgenda(leadId);
  revalider(leadId);
  return { ok: true as const, error: null, agenda: agenda.synced };
}

// RDV à reprogrammer (client absent / a annulé) : statut + journal.
export async function rdvAReprogrammer(leadId: string, commentaire?: string | null) {
  const userId = await currentUserId();
  await db
    .update(leads)
    .set({ rdvStatut: "a_reprogrammer", updatedAt: new Date(), updatedBy: userId })
    .where(eq(leads.id, leadId));
  await db.insert(echanges).values({
    leadId,
    userId,
    type: "rdv",
    contenu: `RDV à reprogrammer${commentaire?.trim() ? ` : ${commentaire.trim()}` : ""}`,
  });
  revalider(leadId);
  return { ok: true as const, error: null };
}

// Le devis est à rédiger : étape « Devis à envoyer » (jamais en arrière).
export async function devisAEnvoyer(leadId: string) {
  const userId = await currentUserId();
  const bouge = await deplacer(leadId, STAGE.DEVIS_A_ENVOYER, userId, { seulementEnAvant: true });
  if (bouge) {
    await db
      .update(leads)
      .set({ updatedAt: new Date(), updatedBy: userId })
      .where(eq(leads.id, leadId));
  }
  revalider(leadId);
  return { ok: true as const, error: null, bouge };
}

// Réactive un prospect perdu : retour en « Rappeler », statut en cours, raison
// de perte effacée, commentaire obligatoire (pourquoi on le rappelle).
export async function reactiverLead(leadId: string, commentaire: string) {
  const c = commentaire.trim();
  if (!c) return { ok: false as const, error: "Indique pourquoi tu réactives cette fiche." };
  const userId = await currentUserId();
  const cible = await stageParCode(STAGE.RAPPELER);
  if (!cible) return { ok: false as const, error: "Étape « Rappeler » introuvable." };
  await db
    .update(leads)
    .set({
      stageId: cible.id,
      statut: "en_cours",
      raisonPerte: null,
      updatedAt: new Date(),
      updatedBy: userId,
    })
    .where(eq(leads.id, leadId));
  await db.insert(echanges).values({
    leadId,
    userId,
    type: "etape",
    contenu: `Réactivé → « ${cible.nom} » : ${c}`,
  });
  revalider(leadId);
  return { ok: true as const, error: null };
}
