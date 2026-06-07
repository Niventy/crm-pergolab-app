"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { leads, stages } from "@/db/schema";
import { currentUserId } from "@/lib/current-user";

export type LeadEditInput = {
  nom: string;
  entreprise: string;
  email: string;
  telephone: string;
  source: string;
  campagne: string;
  montant: string;
  probabilite: string;
  objectifDate: string;
  typeProjet: string;
  codePostal: string;
  dateInstallation: string;
  dateSouhaiteeAppel: string;
  stageId: string;
  assignedTo: string;
  rdvDate: string;
  rdvType: string;
  rdvStatut: string;
  nextRelanceDate: string;
  relanceCount: string;
  // Métriques commerciales
  datePremierContact: string;
  raisonPerte: string;
  modePaiement: string;
  acompte: string;
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

  const stageId = orNull(data.stageId);

  // Statut déduit de l'étape sélectionnée.
  let statut: "en_cours" | "gagnee" | "perdue" = "en_cours";
  if (stageId) {
    const [stage] = await db
      .select()
      .from(stages)
      .where(eq(stages.id, stageId))
      .limit(1);
    if (stage?.isPerdue) statut = "perdue";
    else if (stage?.isGagnee || stage?.cycle === 3) statut = "gagnee";
  }

  await db
    .update(leads)
    .set({
      nom: data.nom.trim(),
      entreprise: orNull(data.entreprise),
      email: orNull(data.email),
      telephone: orNull(data.telephone),
      source: orNull(data.source),
      campagne: orNull(data.campagne),
      montant: orNull(data.montant),
      probabilite: intOrNull(data.probabilite),
      objectifDate: orNull(data.objectifDate),
      typeProjet: orNull(data.typeProjet),
      codePostal: orNull(data.codePostal),
      dateInstallation: orNull(data.dateInstallation),
      dateSouhaiteeAppel: orNull(data.dateSouhaiteeAppel),
      stageId,
      assignedTo: orNull(data.assignedTo),
      rdvDate: orNull(data.rdvDate),
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
      modePaiement: orNull(data.modePaiement) as
        | "comptant"
        | "financement_60"
        | "financement_120"
        | null,
      acompte: orNull(data.acompte),
      montantAchat: orNull(data.montantAchat),
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

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/kanban");
  redirect(`/leads/${leadId}`);
}
