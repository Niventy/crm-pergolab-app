import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { devis, documents, leads, validationsChantier } from "@/db/schema";
import {
  adresseChantier,
  construirePoints,
  lireMetre,
  metreComplet,
  type PointValidation,
} from "@/lib/chantier-validation";

// Devis de référence du chantier : le devis signé, sinon le plus récent retenu.
export async function devisReference(leadId: string) {
  const rows = await db
    .select()
    .from(devis)
    .where(eq(devis.leadId, leadId))
    .orderBy(desc(devis.createdAt));
  return rows.find((d) => d.accepteAt) ?? rows.find((d) => d.statut !== "Non retenu") ?? null;
}

// Dernière validation non annulée de la fiche (demandée, validée ou à corriger).
export async function validationCourante(leadId: string) {
  const [v] = await db
    .select()
    .from(validationsChantier)
    .where(and(eq(validationsChantier.leadId, leadId), ne(validationsChantier.statut, "annulee")))
    .orderBy(desc(validationsChantier.demandeeAt))
    .limit(1);
  return v ?? null;
}

// Points à faire valider, construits à partir de l'état ACTUEL de la fiche.
export async function pointsPourLead(
  leadId: string,
): Promise<{ ok: true; points: PointValidation[] } | { ok: false; error: string }> {
  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, leadId), isNull(leads.deletedAt)))
    .limit(1);
  if (!lead) return { ok: false, error: "Fiche introuvable." };
  const metre = lireMetre(lead.metre);
  if (!metreComplet(metre))
    return { ok: false, error: "Saisis d'abord le métré (largeur, avancée, pose)." };
  const [ref, docs] = await Promise.all([
    devisReference(leadId),
    db
      .select({ id: documents.id, nom: documents.nom })
      .from(documents)
      .where(and(eq(documents.leadId, leadId), inArray(documents.partage, ["a_valider"])))
      .orderBy(documents.createdAt),
  ]);
  return {
    ok: true,
    points: construirePoints({
      adressePose: adresseChantier(lead),
      metre,
      config: ref?.config ?? null,
      lignesDevis: ref?.lignes ?? null,
      documents: docs,
    }),
  };
}
