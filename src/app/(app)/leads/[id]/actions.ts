"use server";

import { eq, asc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { leads, stages, notes, echanges, profiles, devis } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { currentUserId } from "@/lib/current-user";
import { notifier } from "@/lib/notifications";
import {
  creerDevisPennylane,
  listProduitsPennylane,
  getQuoteLines,
  updateQuotePennylane,
  getQuotePdfUrl,
  buildQuoteAppUrl,
  buildEsignatureUrl,
  envoyerDevisEmail,
  assurerContactPennylane,
  type DevisLine,
} from "@/lib/pennylane";

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
  const userId = await currentUserId();
  await db.insert(notes).values({
    leadId,
    userId,
    contenu: c,
    mentions: mentions.length ? mentions : null,
  });

  // Notifie les personnes @mentionnées (hors l'auteur).
  if (mentions.length) {
    const [lead] = await db
      .select({ nom: leads.nom })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);
    const [acteur] = userId
      ? await db
          .select({ nom: profiles.nom, email: profiles.email })
          .from(profiles)
          .where(eq(profiles.id, userId))
          .limit(1)
      : [undefined];
    const par = acteur?.nom ?? acteur?.email ?? "Quelqu'un";
    await notifier({
      userIds: mentions,
      type: "mention",
      leadId,
      acteurId: userId,
      message: `${par} vous a mentionné sur « ${lead?.nom ?? "une fiche"} »`,
    });
  }

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

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/kanban");
  revalidatePath("/liste");
  return { ok: true as const, error: null };
}

// Crée un devis Pennylane à partir des lignes composées dans le CRM.
// Effet de bord : le lead avance en « Devis envoyé », on trace l'activité et on
// programme un rappel de relance (+3 j). N'écrase jamais une étape plus avancée.
export async function creerDevis(leadId: string, lines: DevisLine[]) {
  const r = await creerDevisPennylane(leadId, lines);
  if (!r.ok) return { ...r, appUrl: null as string | null };

  try {
    const userId = await currentUserId();
    const [lead] = await db
      .select({ stageId: leads.stageId, statut: leads.statut })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);
    const [cible] = await db
      .select()
      .from(stages)
      .where(eq(stages.nom, "Devis envoyé"))
      .limit(1);
    const [actuelle] = lead?.stageId
      ? await db.select().from(stages).where(eq(stages.id, lead.stageId)).limit(1)
      : [undefined];

    // On n'avance que si l'étape cible est bien devant l'étape actuelle.
    const avance =
      cible && lead?.statut === "en_cours" &&
      (!actuelle || cible.position > actuelle.position);

    const rappel = new Date(new Date().getTime() + 3 * 86400000)
      .toISOString()
      .slice(0, 10);

    await db
      .update(leads)
      .set({
        ...(avance ? { stageId: cible.id } : {}),
        nextRelanceDate: rappel,
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(eq(leads.id, leadId));

    await db.insert(echanges).values({
      leadId,
      userId,
      type: "devis_envoye",
      contenu: `Devis ${r.numero ?? ""} envoyé — relance prévue le ${rappel
        .split("-")
        .reverse()
        .join("/")}`,
    });
  } catch (e) {
    console.error("Suivi devis envoyé échoué:", e);
  }

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/kanban");
  revalidatePath("/liste");
  revalidatePath("/devis");
  const appUrl = r.quoteId ? await buildQuoteAppUrl(r.quoteId) : null;
  return { ...r, appUrl };
}

// Catalogue de présélections (produits Pennylane) pour l'éditeur de devis.
export async function fetchProduits() {
  return listProduitsPennylane();
}

// Charge les lignes d'un devis existant (pour le rééditer dans le CRM).
export async function getDevisLines(quoteId: string) {
  return getQuoteLines(quoteId);
}

// Enregistre les modifications d'un devis existant (lignes éditées dans le CRM).
export async function modifierDevis(
  leadId: string,
  devisId: string,
  quoteId: string,
  lines: DevisLine[],
) {
  const r = await updateQuotePennylane(quoteId, lines);
  if (!r.ok) return r;
  await db
    .update(devis)
    .set({ montant: String(r.totalHt ?? 0) })
    .where(eq(devis.id, devisId));
  // Le montant du lead suit celui du devis (sinon pipeline/CA restent à 0).
  await db
    .update(leads)
    .set({
      montant: String(r.totalHt ?? 0),
      updatedAt: new Date(),
      updatedBy: await currentUserId(),
    })
    .where(eq(leads.id, leadId));
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/kanban");
  revalidatePath("/liste");
  revalidatePath("/devis");
  revalidatePath("/dashboard");
  return r;
}

// URL de l'éditeur Pennylane pour un devis déjà créé.
export async function devisAppUrl(quoteId: string) {
  return buildQuoteAppUrl(quoteId);
}

// URL fraîche du PDF d'un devis Pennylane (le lien expire ~30 min).
export async function devisPdfUrl(quoteId: string) {
  return getQuotePdfUrl(quoteId);
}

// URL de la page « Envoyer pour e-signature » (Yousign via Pennylane).
export async function devisSignatureUrl(quoteId: string) {
  return buildEsignatureUrl(quoteId);
}

// Crée le contact signataire manquant sur le client Pennylane (pour la signature).
export async function creerContactSignataire(leadId: string) {
  return assurerContactPennylane(leadId);
}

// Envoie le devis par email au client (via Pennylane).
export async function envoyerDevis(quoteId: string, email?: string) {
  const dest = email?.trim() ? [email.trim()] : undefined;
  return envoyerDevisEmail(quoteId, dest);
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

  // Notifie la personne nouvellement attribuée (sauf auto-attribution).
  if (assignedTo && assignedTo !== userId) {
    const [{ nom } = { nom: null }] = await db
      .select({ nom: leads.nom })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);
    const [acteur] = userId
      ? await db
          .select({ nom: profiles.nom, email: profiles.email })
          .from(profiles)
          .where(eq(profiles.id, userId))
          .limit(1)
      : [undefined];
    const par = acteur?.nom ?? acteur?.email ?? "Quelqu'un";
    await notifier({
      userIds: [assignedTo],
      type: "attribution",
      leadId,
      acteurId: userId,
      message: `${par} vous a attribué « ${nom ?? "une fiche"} »`,
    });
  }

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

// Enregistre l'encaissement + le dossier administratif de la commande (fiche).
// Champs à valeurs nulles = effacés. Numériques stockés en texte (numeric).
export type EncaissementInput = {
  montantTtc?: string | null;
  acompteEncaisse?: string | null;
  paiementEspece?: string | null;
  financeur?: string | null;
  equipePose?: string | null;
  mesure?: string | null;
  factureSoldeClient?: boolean;
  factureSoldePoseur?: boolean;
  dossierDateEnvoi?: string | null;
};

export async function saveEncaissement(
  leadId: string,
  data: EncaissementInput,
) {
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

  await db
    .update(leads)
    .set({
      montantTtc: num(data.montantTtc),
      acompteEncaisse: num(data.acompteEncaisse),
      paiementEspece: num(data.paiementEspece),
      financeur: txt(data.financeur),
      equipePose: txt(data.equipePose),
      mesure: txt(data.mesure),
      factureSoldeClient: !!data.factureSoldeClient,
      factureSoldePoseur: !!data.factureSoldePoseur,
      dossierDateEnvoi: txt(data.dossierDateEnvoi),
      updatedAt: new Date(),
      updatedBy: await currentUserId(),
    })
    .where(eq(leads.id, leadId));

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/clients");
  return { ok: true as const, error: null };
}

// Champs client modifiables sur place (whitelist) → libellé pour la trace.
const CHAMPS_CLIENT: Record<string, string> = {
  nom: "Nom",
  telephone: "Téléphone",
  email: "Email",
  adresse: "Adresse",
  codePostal: "Code postal",
  ville: "Ville",
  gamme: "Gamme",
  dimensions: "Produit / dimensions",
  finition: "Finition",
  options: "Options",
  mesure: "Mesure",
  equipePose: "Équipe de pose",
  adressePose: "Adresse de pose",
};

// Enregistre des champs client + JOURNALISE ce qui a réellement changé
// (une entrée d'activité type « modification » avec les libellés modifiés).
export async function saveLeadChamps(
  leadId: string,
  data: Record<string, string | null>,
) {
  const userId = await currentUserId();
  const keys = Object.keys(data).filter((k) => k in CHAMPS_CLIENT);
  if (keys.length === 0) return { ok: false as const, error: "Aucun champ." };

  const [current] = await db
    .select()
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
  if (!current) return { ok: false as const, error: "Fiche introuvable." };
  const cur = current as Record<string, unknown>;

  const set: Record<string, unknown> = { updatedAt: new Date(), updatedBy: userId };
  const changed: string[] = [];
  for (const k of keys) {
    const val = (data[k] ?? "").toString().trim() || null;
    set[k] = val;
    const before = (cur[k] ?? null) as string | null;
    if ((before ?? null) !== val) changed.push(CHAMPS_CLIENT[k]);
  }

  await db
    .update(leads)
    .set(set as Partial<typeof leads.$inferInsert>)
    .where(eq(leads.id, leadId));

  if (changed.length > 0) {
    await db.insert(echanges).values({
      leadId,
      userId,
      type: "modification",
      contenu: `Modifié : ${changed.join(", ")}`,
    });
  }

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/clients");
  return { ok: true as const, error: null, changed };
}
