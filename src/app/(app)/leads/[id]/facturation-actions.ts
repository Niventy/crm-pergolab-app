"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { leads, factures } from "@/db/schema";
import { creerFacturePennylane, getFacturePdfUrl } from "@/lib/pennylane";

function produitLibelle(gamme: string | null, dimensions: string | null): string {
  return [gamme, dimensions].filter(Boolean).join(" ") || "commande pergola";
}

// Facture d'acompte : montant HT saisi (brouillon Pennylane).
export async function creerFactureAcompte(leadId: string, montantHt: number) {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead) return { ok: false as const, error: "Fiche introuvable." };

  const r = await creerFacturePennylane(leadId, {
    type: "acompte",
    libelle: `Acompte — ${produitLibelle(lead.gamme, lead.dimensions)}`,
    montantHt,
    tva: 20,
    draft: true,
  });
  if (r.ok) revalidatePath(`/leads/${leadId}`);
  return r;
}

// Facture de solde : reste HT = montant HT de la commande − factures déjà émises.
export async function creerFactureSolde(leadId: string) {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead) return { ok: false as const, error: "Fiche introuvable." };

  const dejaFactures = await db
    .select({ m: factures.montantHt })
    .from(factures)
    .where(eq(factures.leadId, leadId));
  const totalFacture = dejaFactures.reduce((a, f) => a + Number(f.m ?? 0), 0);
  const totalHt = Number(lead.montant ?? 0);
  const reste = Math.round((totalHt - totalFacture) * 100) / 100;
  if (reste <= 0)
    return { ok: false as const, error: "Rien à facturer (déjà entièrement facturé)." };

  const r = await creerFacturePennylane(leadId, {
    type: "solde",
    libelle: `Solde — ${produitLibelle(lead.gamme, lead.dimensions)}`,
    montantHt: reste,
    tva: 20,
    draft: true,
  });
  if (r.ok) revalidatePath(`/leads/${leadId}`);
  return r;
}

// URL du PDF d'une facture (ouverture/téléchargement).
export async function facturePdfUrl(externalId: string) {
  return getFacturePdfUrl(externalId);
}
