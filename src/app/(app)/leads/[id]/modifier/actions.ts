"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { leads, stages } from "@/db/schema";
import { currentUserId, isAdmin } from "@/lib/current-user";
import { autoAccepterDevisSiUnique } from "@/lib/devis-accepte";
import { statutPourStage } from "@/lib/pipeline";
import { etapeEffective } from "@/lib/pipeline-server";
import { syncRdvAgenda } from "@/lib/rdv-agenda";

export type LeadEditInput = {
  nom: string;
  entreprise: string;
  siret: string;
  tvaIntracom: string;
  email: string;
  telephone: string;
  source: string;
  campagne: string;
  typeProjet: string;
  adresse: string;
  ville: string;
  codePostal: string;
  dateInstallation: string;
  dateSouhaiteeAppel: string;
  stageId: string;
  assignedTo: string;
  rdvDate: string;
  rdvHeure: string;
  rdvType: string;
  rdvStatut: string;
  nextRelanceDate: string;
  relanceCount: string;
  // Métriques commerciales
  datePremierContact: string;
  raisonPerte: string;
  montantAchat: string;
  // Produit
  gamme: string;
  dimensions: string;
  finition: string;
  options: string;
  typePose: string;
  // Pose & technique
  poseAssignedTo: string;
  dateMetre: string;
  fournisseur: string;
  refCommande: string;
  dateCommande: string;
  dateLivraisonPrevue: string;
  dateLivraisonReelle: string;
  datePosePrevue: string;
  datePoseReelle: string;
  adressePose: string;
};

const orNull = (v: string) => {
  const t = v?.trim?.() ?? "";
  return t === "" ? null : t;
};
const intOrNull = (v: string) => {
  const n = orNull(v);
  return n === null ? null : Number(n);
};

export async function updateLead(leadId: string, data: LeadEditInput) {
  if (!data.nom?.trim()) {
    throw new Error("Le nom est requis.");
  }

  // Le coût fournisseur est un secret business : un ADV ne peut ni le voir ni
  // l'écraser (le champ n'est pas dans son formulaire → il enverrait du vide).
  const admin = await isAdmin();

  let stageId = orNull(data.stageId);

  // Statut déduit de l'étape sélectionnée ; « Signée » ⇒ chantier démarré
  // (1ʳᵉ étape du cycle 3), comme depuis le Kanban ou le rail de la fiche.
  let statut: "en_cours" | "gagnee" | "perdue" = "en_cours";
  if (stageId) {
    const [demandee] = await db
      .select()
      .from(stages)
      .where(eq(stages.id, stageId))
      .limit(1);
    if (demandee) {
      const stage = await etapeEffective(demandee);
      stageId = stage.id;
      statut = demandee.isGagnee ? "gagnee" : statutPourStage(stage);
    }
  }

  await db
    .update(leads)
    .set({
      nom: data.nom.trim(),
      entreprise: orNull(data.entreprise),
      siret: orNull(data.siret),
      tvaIntracom: orNull(data.tvaIntracom),
      email: orNull(data.email),
      telephone: orNull(data.telephone),
      source: orNull(data.source),
      campagne: orNull(data.campagne),
      // (montant / probabilité / objectif : retirés de l'interface — le montant
      // vient du devis ; les colonnes restent en base)
      typeProjet: orNull(data.typeProjet),
      adresse: orNull(data.adresse),
      ville: orNull(data.ville),
      codePostal: orNull(data.codePostal),
      dateInstallation: orNull(data.dateInstallation),
      dateSouhaiteeAppel: orNull(data.dateSouhaiteeAppel),
      stageId,
      assignedTo: orNull(data.assignedTo),
      rdvDate: orNull(data.rdvDate),
      rdvHeure: orNull(data.rdvHeure),
      rdvType: orNull(data.rdvType) as "physique" | "visio" | null,
      rdvStatut: orNull(data.rdvStatut) as
        | "prevu"
        | "a_reprogrammer"
        | "honore"
        | null,
      nextRelanceDate: orNull(data.nextRelanceDate),
      relanceCount: intOrNull(data.relanceCount) ?? 0,
      // Métriques commerciales
      datePremierContact: data.datePremierContact
        ? new Date(data.datePremierContact)
        : null,
      raisonPerte: orNull(data.raisonPerte) as
        | "prix"
        | "delai"
        | "concurrent"
        | "injoignable"
        | "annule"
        | "non_qualifie"
        | "autre"
        | null,
      ...(admin ? { montantAchat: orNull(data.montantAchat) } : {}),
      // Produit
      gamme: orNull(data.gamme),
      dimensions: orNull(data.dimensions),
      finition: orNull(data.finition),
      options: orNull(data.options),
      typePose: orNull(data.typePose) as "autoportee" | "adossee" | null,
      // Pose & technique
      poseAssignedTo: orNull(data.poseAssignedTo),
      dateMetre: orNull(data.dateMetre),
      fournisseur: orNull(data.fournisseur),
      refCommande: orNull(data.refCommande),
      dateCommande: orNull(data.dateCommande),
      dateLivraisonPrevue: orNull(data.dateLivraisonPrevue),
      dateLivraisonReelle: orNull(data.dateLivraisonReelle),
      datePosePrevue: orNull(data.datePosePrevue),
      datePoseReelle: orNull(data.datePoseReelle),
      adressePose: orNull(data.adressePose),
      statut,
      ...(statut === "gagnee"
        ? { dateSignature: sql`COALESCE(${leads.dateSignature}, CURRENT_DATE)` }
        : {}),
      updatedAt: new Date(),
      updatedBy: await currentUserId(),
    })
    .where(eq(leads.id, leadId));

  // Signature : le devis unique devient le devis accepté (base de facturation).
  if (statut === "gagnee") await autoAccepterDevisSiUnique(leadId);

  // --- Synchronisation Google Agenda (RDV) — helper partagé avec la fiche ---
  await syncRdvAgenda(leadId);

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/kanban");
  redirect(`/leads/${leadId}`);
}
