"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { creerFacturePennylane, getFacturePdfUrl } from "@/lib/pennylane";
import { etatFacturation } from "@/lib/facturation";
import { repartirTtcParTaux, tauxLabel, r2 } from "@/lib/devis-calc";
import { formatEurosCents, formatDate } from "@/lib/format";

const SANS_DEVIS: Record<"aucun" | "choix", string> = {
  aucun: "Aucun devis sur cette fiche : crée le devis avant de facturer.",
  choix:
    "Plusieurs devis sur cette fiche : marque d'abord le devis signé (section Devis).",
};

// Facture d'ACOMPTE : montant saisi en TTC (ce que paie le client), réparti sur
// les taux de TVA du devis au prorata → la TVA facturée est celle du devis.
export async function creerFactureAcompte(leadId: string, montantTtc: number) {
  const m = r2(montantTtc);
  if (!(m > 0)) return { ok: false as const, error: "Montant d'acompte invalide." };

  const etat = await etatFacturation(leadId);
  const ref = etat.devisRef;
  if (!ref) return { ok: false as const, error: SANS_DEVIS[etat.raison ?? "aucun"] };
  if (etat.resteTtc <= 0)
    return { ok: false as const, error: "Ce devis est déjà entièrement facturé." };
  if (m > etat.resteTtc + 0.005)
    return {
      ok: false as const,
      error: `L'acompte dépasse le reste à facturer (${formatEurosCents(etat.resteTtc)} TTC).`,
    };

  // Garde anti double-clic : même montant d'acompte créé il y a moins d'une minute.
  const recent = etat.factures.find(
    (f) =>
      f.type === "acompte" &&
      f.statut !== "supprimee" &&
      Math.abs(f.montantTtc - m) < 0.01 &&
      Date.now() - new Date(f.createdAt).getTime() < 60_000,
  );
  if (recent)
    return {
      ok: false as const,
      error: `Une facture d'acompte identique (${recent.numero ?? ""}) vient d'être créée.`,
    };

  const pct = Math.round((m / ref.ttc) * 100);
  const base = new Map(etat.resteParTaux.map((x) => [x.taux, x.ht]));
  const numero = ref.numero ? `N° ${ref.numero}` : "";
  const lignes = repartirTtcParTaux(base, m, (t, multi) =>
    `Acompte ${pct} % — Devis ${numero}${multi ? ` (TVA ${tauxLabel(t)})` : ""}`.trim(),
  );
  if (!lignes.length) return { ok: false as const, error: "Répartition impossible." };

  const dejaAcomptes = etat.factures.filter(
    (f) => f.type === "acompte" && f.statut !== "supprimee",
  );
  const mention = [
    `Facture d'acompte de ${pct} % sur le devis ${numero} (${formatEurosCents(ref.ttc)} TTC).`,
    ...dejaAcomptes.map(
      (f) =>
        `Acompte déjà facturé : ${f.numero ?? "—"} — ${formatEurosCents(f.montantTtc)} TTC.`,
    ),
  ].join("\n");

  const r = await creerFacturePennylane(leadId, {
    type: "acompte",
    lignes,
    mention,
    draft: true,
  });
  if (r.ok) revalidatePath(`/leads/${leadId}`);
  return r;
}

// Facture de SOLDE : tout le reste à facturer, taux par taux, avec rappel des
// acomptes déjà facturés (obligatoire sur une facture de solde).
export async function creerFactureSolde(leadId: string) {
  const etat = await etatFacturation(leadId);
  const ref = etat.devisRef;
  if (!ref) return { ok: false as const, error: SANS_DEVIS[etat.raison ?? "aucun"] };
  if (etat.resteTtc <= 0 || etat.resteParTaux.length === 0)
    return { ok: false as const, error: "Rien à facturer (déjà entièrement facturé)." };

  const numero = ref.numero ? `N° ${ref.numero}` : "";
  const multi = etat.resteParTaux.length > 1;
  const lignes = etat.resteParTaux.map((x) => ({
    designation: `Solde — Devis ${numero}${multi ? ` (TVA ${tauxLabel(x.taux)})` : ""}`.trim(),
    quantite: 1 as const,
    prixHt: r2(x.ht),
    tva: x.taux,
  }));

  const acomptes = etat.factures.filter(
    (f) => f.type === "acompte" && f.statut !== "supprimee",
  );
  const mention = [
    `Facture de solde du devis ${numero} (${formatEurosCents(ref.ttc)} TTC).`,
    ...acomptes.map(
      (f) =>
        `Acompte facturé le ${formatDate(f.createdAt.slice(0, 10))} : ${f.numero ?? "—"} — ${formatEurosCents(f.montantTtc)} TTC.`,
    ),
    `Reste dû : ${formatEurosCents(etat.resteTtc)} TTC.`,
  ].join("\n");

  const r = await creerFacturePennylane(leadId, {
    type: "solde",
    lignes,
    mention,
    draft: true,
  });
  if (r.ok) {
    // La case « facture de solde client » du dossier se coche toute seule.
    await db.update(leads).set({ factureSoldeClient: true }).where(eq(leads.id, leadId));
    revalidatePath(`/leads/${leadId}`);
    revalidatePath("/clients", "layout");
  }
  return r;
}

// Re-synchronise les statuts avec Pennylane (brouillons supprimés, validations).
export async function synchroniserFacturation(leadId: string) {
  const etat = await etatFacturation(leadId);
  revalidatePath(`/leads/${leadId}`);
  return { ok: !etat.syncError, error: etat.syncError };
}

// URL du PDF d'une facture (ouverture/téléchargement).
export async function facturePdfUrl(externalId: string) {
  return getFacturePdfUrl(externalId);
}
