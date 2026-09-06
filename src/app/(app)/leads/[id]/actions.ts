"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { leads, stages, notes, echanges, profiles, devis } from "@/db/schema";
import { currentUserId } from "@/lib/current-user";
import { notifier } from "@/lib/notifications";
import { accepterDevis, autoAccepterDevisSiUnique } from "@/lib/devis-accepte";
import { statutPourStage, STAGE, type StageCode } from "@/lib/pipeline";
import { etapeEffective, libelleDeplacement, stageParCode } from "@/lib/pipeline-server";

type RaisonPerte =
  | "prix"
  | "delai"
  | "concurrent"
  | "injoignable"
  | "annule"
  | "non_qualifie"
  | "autre";
const RAISONS: RaisonPerte[] = [
  "prix", "delai", "concurrent", "injoignable", "annule", "non_qualifie", "autre",
];
import {
  creerDevisPennylane,
  getQuoteLines,
  updateQuotePennylane,
  enregistrerDevisModifie,
  getQuoteStatus,
  getQuotePdfUrl,
  buildQuoteAppUrl,
  buildEsignatureUrl,
  assurerContactPennylane,
  type DevisLine,
} from "@/lib/pennylane";

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

  // Pilules de CHANTIER : elles datent ET font avancer l'étape (jamais en
  // arrière). Avant, la fiche restait « À métrer » avec un métré daté.
  const CIBLE_PAR_PILULE: Record<string, StageCode> = {
    metre: STAGE.METRE_REALISE,
    commande: STAGE.COMMANDE_FOURNISSEUR,
    livre: STAGE.POSE_PLANIFIEE,
    pose: STAGE.POSEE,
  };
  const cibleCode = CIBLE_PAR_PILULE[type];
  if (cibleCode) {
    const [cur] = await db
      .select({ stageId: leads.stageId, statut: leads.statut })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);
    const cible = await stageParCode(cibleCode);
    const [actuelle] = cur?.stageId
      ? await db.select().from(stages).where(eq(stages.id, cur.stageId)).limit(1)
      : [undefined];
    if (
      cible &&
      cur?.statut === "gagnee" &&
      actuelle?.cycle === 3 &&
      !actuelle.isPerdue &&
      cible.position > actuelle.position
    ) {
      updates.stageId = cible.id;
      await db.insert(echanges).values({
        leadId,
        userId,
        type: "etape",
        contenu: `Déplacé en « ${cible.nom} » (pilule)`,
      });
    }
  }

  await db.update(leads).set(updates).where(eq(leads.id, leadId));

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/kanban");
  revalidatePath("/clients", "layout");
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

// Déplace le lead vers une étape précise (depuis le rail de la fiche ou le
// Kanban pour une perte). Commentaire OBLIGATOIRE, sauf « Pas de réponse ».
// Étape perdue : la RAISON de perte est enregistrée (statistiques de perte).
// Journalise le déplacement (avec horodatage) dans l'activité.
export async function changerEtape(
  leadId: string,
  stageId: string,
  commentaire: string,
  raison?: string | null,
) {
  const userId = await currentUserId();
  const [demandee] = await db
    .select()
    .from(stages)
    .where(eq(stages.id, stageId))
    .limit(1);
  if (!demandee) return { ok: false as const, error: "Étape inconnue." };

  const c = (commentaire ?? "").trim();
  // Commentaire obligatoire en prospection / closing (sauf « Pas de réponse ») ;
  // facultatif sur les étapes de CHANTIER (avancer « Métré réalisé » ne mérite
  // pas une justification écrite).
  if (!c && demandee.code !== STAGE.PAS_DE_REPONSE && demandee.cycle !== 3) {
    return { ok: false as const, error: "Commentaire obligatoire." };
  }
  const r = RAISONS.includes(raison as RaisonPerte) ? (raison as RaisonPerte) : null;
  if (demandee.isPerdue && !r) {
    return { ok: false as const, error: "Indique la raison de la perte." };
  }

  // « Signée » ⇒ chantier démarré sur la 1ʳᵉ étape du cycle 3.
  const stage = await etapeEffective(demandee);
  const statut = demandee.isGagnee ? "gagnee" : statutPourStage(stage);

  await db
    .update(leads)
    .set({
      stageId: stage.id,
      statut,
      ...(statut === "gagnee"
        ? { dateSignature: sql`COALESCE(${leads.dateSignature}, CURRENT_DATE)` }
        : {}),
      ...(statut === "perdue" && r ? { raisonPerte: r } : {}),
      updatedAt: new Date(),
      updatedBy: userId,
    })
    .where(eq(leads.id, leadId));

  const raisonLabel = r ? ` · raison : ${r.replace("_", " ")}` : "";
  await db.insert(echanges).values({
    leadId,
    userId,
    type: "etape",
    contenu: `${libelleDeplacement(demandee, stage)}${raisonLabel}${c ? ` : ${c}` : ""}`,
  });

  // Signature : le devis unique devient le devis accepté (base de facturation).
  if (statut === "gagnee") await autoAccepterDevisSiUnique(leadId);

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/kanban");
  revalidatePath("/liste");
  revalidatePath("/clients", "layout");
  return { ok: true as const, error: null };
}

// Marque le devis SIGNÉ par le client (un seul par lead). Fixe le montant du
// lead et sert de base à la facturation (acompte / solde par taux de TVA).
export async function marquerDevisAccepte(leadId: string, devisId: string) {
  const r = await accepterDevis(leadId, devisId);
  if (r.ok) {
    const [d] = await db
      .select({ numero: devis.numero })
      .from(devis)
      .where(eq(devis.id, devisId))
      .limit(1);
    await db.insert(echanges).values({
      leadId,
      userId: await currentUserId(),
      type: "devis_accepte",
      contenu: `Devis ${d?.numero ?? ""} marqué signé`.trim(),
    });
    revalidatePath(`/leads/${leadId}`);
    revalidatePath("/kanban");
    revalidatePath("/liste");
    revalidatePath("/devis");
    revalidatePath("/dashboard");
    revalidatePath("/clients", "layout");
  }
  return r;
}

// Crée un devis Pennylane à partir des lignes composées dans le CRM.
// Créer ≠ envoyer : on journalise « Devis créé » ; c'est l'ENVOI réel (Gmail ou
// Pennylane) qui fait avancer la fiche en « Devis envoyé » et programme la relance.
export async function creerDevis(leadId: string, lines: DevisLine[], config?: unknown) {
  const r = await creerDevisPennylane(leadId, lines, config);
  if (!r.ok) return { ...r, appUrl: null as string | null };

  try {
    const userId = await currentUserId();
    await db
      .update(leads)
      .set({ updatedAt: new Date(), updatedBy: userId })
      .where(eq(leads.id, leadId));
    await db.insert(echanges).values({
      leadId,
      userId,
      type: "devis_cree",
      contenu: `Devis ${r.numero ?? ""} créé (brouillon Pennylane)`.replace(/\s+/g, " "),
    });
  } catch (e) {
    console.error("Journal devis créé échoué:", e);
  }

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/kanban");
  revalidatePath("/liste");
  revalidatePath("/devis");
  const appUrl = r.quoteId ? await buildQuoteAppUrl(r.quoteId) : null;
  return { ...r, appUrl };
}

// Duplique un devis : recrée un NOUVEAU devis avec les mêmes lignes (utile pour
// proposer 2 variantes, ex. avec / sans options). La clause est retirée puis
// ré-ajoutée automatiquement pour éviter tout doublon.
export async function dupliquerDevis(leadId: string, quoteId: string) {
  const src = await getQuoteLines(quoteId);
  if (!src.ok || !src.lines?.length)
    return {
      ok: false as const,
      error: src.error ?? "Lignes du devis introuvables.",
      devisId: null as string | null,
    };
  const lignes = src.lines.filter(
    (l) => !l.designation.trim().toLowerCase().startsWith("clause suspensive"),
  );
  // La config du configurateur suit la copie (pour rouvrir la pergola).
  const [orig] = await db
    .select({ config: devis.config })
    .from(devis)
    .where(eq(devis.externalId, quoteId))
    .limit(1);
  return creerDevis(leadId, lignes, orig?.config ?? undefined);
}

// Charge les lignes d'un devis existant (pour le rééditer dans le CRM).
export async function getDevisLines(quoteId: string) {
  return getQuoteLines(quoteId);
}

// Enregistre les modifications d'un devis existant (lignes éditées dans le CRM).
// Un devis SIGNÉ (accepté dans le CRM ou verrouillé côté Pennylane) ne se
// modifie plus : la seule voie est « Dupliquer » (nouvelle variante).
export async function modifierDevis(
  leadId: string,
  devisId: string,
  quoteId: string,
  lines: DevisLine[],
  config?: unknown,
) {
  const [row] = await db
    .select({ accepteAt: devis.accepteAt })
    .from(devis)
    .where(eq(devis.id, devisId))
    .limit(1);
  if (row?.accepteAt)
    return {
      ok: false as const,
      error: "Ce devis a été signé : il n'est plus modifiable. Duplique-le pour une nouvelle variante.",
    };
  const st = await getQuoteStatus(quoteId);
  if (st.ok && st.verrouille)
    return {
      ok: false as const,
      error: `Ce devis est ${st.status ?? "verrouillé"} dans Pennylane : il n'est plus modifiable. Duplique-le.`,
    };

  const r = await updateQuotePennylane(quoteId, lines);
  if (!r.ok) return r;
  // Totaux HT/TTC + instantané des lignes ; le montant du lead suit ce devis
  // seulement s'il fait foi (pas de variante acceptée par ailleurs).
  await enregistrerDevisModifie(leadId, devisId, r, config);
  await db
    .update(leads)
    .set({ updatedAt: new Date(), updatedBy: await currentUserId() })
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
// Le CONTACT signataire est créé automatiquement s'il manque (sinon Pennylane
// affiche « contact indisponible ») — plus de bouton technique à cliquer avant.
export async function devisSignatureUrl(quoteId: string, leadId?: string) {
  if (leadId) await assurerContactPennylane(leadId).catch(() => undefined);
  return buildEsignatureUrl(quoteId);
}

// Crée le contact signataire manquant sur le client Pennylane (pour la signature).
export async function creerContactSignataire(leadId: string) {
  return assurerContactPennylane(leadId);
}

// Ajoute un commentaire au DERNIER déplacement d'étape de la fiche (proposé
// juste après un glisser-déposer dans le Kanban, où le commentaire n'est pas
// bloquant — contrairement au rail de la fiche).
export async function ajouterCommentaireEtape(leadId: string, commentaire: string) {
  const c = commentaire.trim();
  if (!c) return { ok: false as const, error: "Commentaire vide." };
  const [dernier] = await db
    .select({ id: echanges.id, contenu: echanges.contenu })
    .from(echanges)
    .where(and(eq(echanges.leadId, leadId), eq(echanges.type, "etape")))
    .orderBy(desc(echanges.date))
    .limit(1);
  if (!dernier) return { ok: false as const, error: "Aucun déplacement à commenter." };
  await db
    .update(echanges)
    .set({ contenu: `${dernier.contenu ?? ""} : ${c}` })
    .where(eq(echanges.id, dernier.id));
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/commentaires");
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

  // Seuls les champs FOURNIS sont écrits : les totaux encaissés viennent de
  // l'historique des paiements et ne doivent pas être écrasés par le dossier.
  await db
    .update(leads)
    .set({
      ...(data.montantTtc !== undefined ? { montantTtc: num(data.montantTtc) } : {}),
      ...(data.acompteEncaisse !== undefined ? { acompteEncaisse: num(data.acompteEncaisse) } : {}),
      ...(data.paiementEspece !== undefined ? { paiementEspece: num(data.paiementEspece) } : {}),
      ...(data.financeur !== undefined ? { financeur: txt(data.financeur) } : {}),
      ...(data.equipePose !== undefined ? { equipePose: txt(data.equipePose) } : {}),
      ...(data.mesure !== undefined ? { mesure: txt(data.mesure) } : {}),
      ...(data.factureSoldeClient !== undefined
        ? { factureSoldeClient: !!data.factureSoldeClient }
        : {}),
      ...(data.factureSoldePoseur !== undefined
        ? { factureSoldePoseur: !!data.factureSoldePoseur }
        : {}),
      ...(data.dossierDateEnvoi !== undefined ? { dossierDateEnvoi: txt(data.dossierDateEnvoi) } : {}),
      updatedAt: new Date(),
      updatedBy: await currentUserId(),
    })
    .where(eq(leads.id, leadId));

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/clients");
  return { ok: true as const, error: null };
}

// Suivi de chantier (dates, poseur, fournisseur, adresse) modifiable en place.
export type ChantierInput = {
  dateMetre: string | null;
  dateCommande: string | null;
  dateLivraisonPrevue: string | null;
  dateLivraisonReelle: string | null;
  datePosePrevue: string | null;
  datePoseReelle: string | null;
  poseAssignedTo: string | null;
  equipePose: string | null;
  fournisseur: string | null;
  refCommande: string | null;
  adressePose: string | null;
};
const CHANTIER_LABELS: Record<keyof ChantierInput, string> = {
  dateMetre: "Date du métré",
  dateCommande: "Date commande",
  dateLivraisonPrevue: "Livraison prévue",
  dateLivraisonReelle: "Livraison réelle",
  datePosePrevue: "Pose prévue",
  datePoseReelle: "Pose réalisée",
  poseAssignedTo: "Poseur",
  equipePose: "Équipe de pose",
  fournisseur: "Fournisseur",
  refCommande: "Réf. commande",
  adressePose: "Adresse de pose",
};

export async function saveChantier(leadId: string, data: ChantierInput) {
  const userId = await currentUserId();
  const [current] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!current) return { ok: false as const, error: "Fiche introuvable." };

  const set: Record<string, unknown> = { updatedAt: new Date(), updatedBy: userId };
  const changed: string[] = [];
  for (const k of Object.keys(CHANTIER_LABELS) as (keyof ChantierInput)[]) {
    const val = (data[k] ?? "").toString().trim() || null;
    if (k.startsWith("date") && val && !/^\d{4}-\d{2}-\d{2}$/.test(val))
      return { ok: false as const, error: `${CHANTIER_LABELS[k]} : date invalide.` };
    set[k] = val;
    if (((current as Record<string, unknown>)[k] ?? null) !== val) changed.push(CHANTIER_LABELS[k]);
  }
  if (changed.length === 0) return { ok: true as const, error: null, changed };

  await db.update(leads).set(set as Partial<typeof leads.$inferInsert>).where(eq(leads.id, leadId));
  await db.insert(echanges).values({
    leadId,
    userId,
    type: "modification",
    contenu: `Chantier : ${changed.join(", ")}`,
  });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/clients", "layout");
  revalidatePath("/emploi-du-temps");
  return { ok: true as const, error: null, changed };
}

// Champs client modifiables sur place (whitelist) → libellé pour la trace.
const CHAMPS_CLIENT: Record<string, string> = {
  nom: "Nom",
  entreprise: "Société",
  siret: "SIRET",
  tvaIntracom: "N° TVA intracom",
  telephone: "Téléphone",
  email: "Email",
  adresse: "Adresse",
  codePostal: "Code postal",
  ville: "Ville",
  typeProjet: "Type de projet",
  dateSouhaiteeAppel: "Créneau d'appel",
  dateInstallation: "Installation souhaitée",
  gamme: "Gamme",
  dimensions: "Dimensions de la pergola",
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

  if (set.nom === null) return { ok: false as const, error: "Le nom est obligatoire." };

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
  revalidatePath("/kanban");
  revalidatePath("/liste");
  revalidatePath("/clients", "layout");
  return { ok: true as const, error: null, changed };
}
