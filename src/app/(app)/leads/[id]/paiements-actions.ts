"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { echanges, leads, paiements } from "@/db/schema";
import { currentUserId } from "@/lib/current-user";
import { r2 } from "@/lib/devis-calc";
import { formatEurosCents, formatDate } from "@/lib/format";
import { MODES_PAIEMENT } from "./paiements-meta";

// (un fichier « use server » ne peut exporter que des fonctions async → les
// constantes vivent dans paiements-meta.ts)
const MODES = new Set(MODES_PAIEMENT.map((m) => m.value));

// Les totaux du lead (lus par le Kanban clients, le Planning, le Dashboard) sont
// des SOMMES de l'historique : hors espèces → acompte_encaisse, espèces → paiement_espece.
async function recalculerTotaux(leadId: string) {
  const rows = await db
    .select({ montant: paiements.montant, mode: paiements.mode })
    .from(paiements)
    .where(eq(paiements.leadId, leadId));
  let especes = 0;
  let autres = 0;
  for (const p of rows) {
    const m = Number(p.montant ?? 0);
    if (p.mode === "especes") especes += m;
    else autres += m;
  }
  await db
    .update(leads)
    .set({
      acompteEncaisse: String(r2(autres)),
      paiementEspece: String(r2(especes)),
      updatedAt: new Date(),
      updatedBy: await currentUserId(),
    })
    .where(eq(leads.id, leadId));
}

function revalider(leadId: string) {
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/clients", "layout");
  revalidatePath("/emploi-du-temps");
  revalidatePath("/dashboard");
  revalidatePath("/comptabilite");
}

export async function addPaiement(
  leadId: string,
  data: { date: string; montant: string | number; mode: string; reference?: string | null },
) {
  const montant = r2(Number(String(data.montant).replace(",", ".")));
  if (!(montant > 0)) return { ok: false as const, error: "Montant invalide." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date))
    return { ok: false as const, error: "Date invalide." };
  const mode = MODES.has(data.mode) ? data.mode : "autre";
  const userId = await currentUserId();

  await db.insert(paiements).values({
    leadId,
    date: data.date,
    montant: String(montant),
    mode,
    reference: data.reference?.trim() || null,
    userId,
  });
  await recalculerTotaux(leadId);
  await db.insert(echanges).values({
    leadId,
    userId,
    type: "paiement",
    contenu: `Paiement reçu le ${formatDate(data.date)} : ${formatEurosCents(montant)} (${
      MODES_PAIEMENT.find((m) => m.value === mode)?.label ?? mode
    })${data.reference?.trim() ? ` · ${data.reference.trim()}` : ""}`,
  });
  revalider(leadId);
  return { ok: true as const, error: null };
}

export async function deletePaiement(leadId: string, id: string) {
  const [p] = await db
    .select()
    .from(paiements)
    .where(and(eq(paiements.id, id), eq(paiements.leadId, leadId)))
    .limit(1);
  if (!p) return { ok: false as const, error: "Paiement introuvable." };
  await db.delete(paiements).where(eq(paiements.id, id));
  await recalculerTotaux(leadId);
  await db.insert(echanges).values({
    leadId,
    userId: await currentUserId(),
    type: "paiement",
    contenu: `Paiement supprimé : ${formatEurosCents(Number(p.montant))} du ${formatDate(p.date)}`,
  });
  revalider(leadId);
  return { ok: true as const, error: null };
}
