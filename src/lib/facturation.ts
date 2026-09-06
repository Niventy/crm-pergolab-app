// État de facturation d'un client : devis de référence (accepté), factures
// existantes (synchronisées avec Pennylane), reste à facturer PAR TAUX de TVA.
// Serveur uniquement (accès DB + Pennylane).
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { devis, factures } from "@/db/schema";
import {
  type LigneCalc,
  type LigneFacture,
  netParTaux,
  resteParTaux,
  r2,
  totalTtc,
  totalHt,
} from "@/lib/devis-calc";
import { echeancierPct, getFactureStatut, getQuoteLines } from "@/lib/pennylane";

export type FactureEtat = {
  id: string;
  type: string;
  numero: string | null;
  externalId: string | null;
  montantHt: number;
  montantTtc: number;
  statut: string | null; // draft / finalized / supprimee
  lignes: LigneFacture[];
  createdAt: string; // ISO
};

export type DevisRef = {
  id: string;
  numero: string | null;
  ht: number;
  ttc: number;
  lignes: LigneCalc[];
  parTaux: { taux: number; ht: number }[];
  accepte: boolean; // false = pris par défaut (devis unique non marqué)
};

export type EtatFacturation = {
  devisRef: DevisRef | null;
  // Pourquoi pas de devis de référence : aucun devis / plusieurs sans choix.
  raison: "aucun" | "choix" | null;
  factures: FactureEtat[]; // toutes, y compris supprimées (affichées barrées)
  ttcFacture: number; // factures actives uniquement
  resteTtc: number;
  resteParTaux: { taux: number; ht: number }[];
  echeancier: [number, number, number];
  syncError: string | null;
};

const ACTIVE = (f: { statut: string | null }) =>
  f.statut !== "supprimee" && f.statut !== "cancelled";

// Devis de référence = accepté ; sinon, s'il n'y en a qu'un, celui-là.
async function devisDeReference(leadId: string): Promise<{
  devisRef: DevisRef | null;
  raison: EtatFacturation["raison"];
}> {
  const rows = await db.query.devis.findMany({
    where: eq(devis.leadId, leadId),
    orderBy: [desc(devis.createdAt)],
  });
  if (rows.length === 0) return { devisRef: null, raison: "aucun" };
  const accepte = rows.find((r) => r.accepteAt);
  const d = accepte ?? (rows.length === 1 ? rows[0] : null);
  if (!d) return { devisRef: null, raison: "choix" };

  // Lignes : instantané en base, sinon relues dans Pennylane (anciens devis) et
  // mémorisées pour la suite.
  let lignes = (d.lignes as LigneCalc[] | null) ?? null;
  if (!lignes && d.externalId) {
    const r = await getQuoteLines(d.externalId);
    if (r.ok && r.lines) {
      lignes = r.lines
        .filter((l) => !l.designation.trim().toLowerCase().startsWith("clause suspensive"))
        .map((l) => ({
          designation: l.designation,
          quantite: l.quantite,
          prixHt: r2(l.prixHt),
          tva: l.tva,
          remisePct: l.remisePct ?? null,
        }));
      await db
        .update(devis)
        .set({
          lignes,
          montant: String(totalHt(lignes)),
          montantTtc: String(totalTtc(lignes)),
        })
        .where(eq(devis.id, d.id));
    }
  }
  if (!lignes) lignes = [];

  const ht = lignes.length ? totalHt(lignes) : Number(d.montant ?? 0);
  const ttc = lignes.length ? totalTtc(lignes) : Number(d.montantTtc ?? 0);
  return {
    devisRef: {
      id: d.id,
      numero: d.numero,
      ht,
      ttc,
      lignes,
      parTaux: [...netParTaux(lignes).entries()].map(([taux, h]) => ({ taux, ht: r2(h) })),
      accepte: !!d.accepteAt,
    },
    raison: null,
  };
}

// Aligne le statut des factures avec Pennylane : un brouillon supprimé côté
// Pennylane est marqué « supprimee » et ne compte plus dans le déjà-facturé.
async function synchroniserFactures(leadId: string): Promise<string | null> {
  if (!process.env.PENNYLANE_API_KEY) return null;
  const rows = await db
    .select({ id: factures.id, externalId: factures.externalId, statut: factures.statut })
    .from(factures)
    .where(and(eq(factures.leadId, leadId), isNotNull(factures.externalId)));
  let err: string | null = null;
  await Promise.all(
    rows
      .filter((r) => r.statut !== "supprimee")
      .map(async (r) => {
        const s = await getFactureStatut(r.externalId!);
        if (!s.ok) {
          err = s.error ?? "Synchronisation Pennylane impossible.";
          return;
        }
        const statut = s.exists ? (s.status ?? r.statut) : "supprimee";
        if (statut !== r.statut)
          await db.update(factures).set({ statut }).where(eq(factures.id, r.id));
      }),
  );
  return err;
}

export async function etatFacturation(leadId: string): Promise<EtatFacturation> {
  const syncError = await synchroniserFactures(leadId);
  const [{ devisRef, raison }, rows] = await Promise.all([
    devisDeReference(leadId),
    db.query.factures.findMany({
      where: eq(factures.leadId, leadId),
      orderBy: (f, { asc }) => [asc(f.createdAt)],
    }),
  ]);

  const list: FactureEtat[] = rows.map((f) => ({
    id: f.id,
    type: f.type,
    numero: f.numero,
    externalId: f.externalId,
    montantHt: Number(f.montantHt ?? 0),
    // Anciennes factures (avant ce correctif) : TTC inconnu → HT × 1,2 (elles
    // étaient toutes émises à 20 %).
    montantTtc: f.montantTtc ? Number(f.montantTtc) : r2(Number(f.montantHt ?? 0) * 1.2),
    statut: f.statut,
    lignes:
      (f.lignes as LigneFacture[] | null) ??
      (f.montantHt
        ? [{ designation: "", quantite: 1, prixHt: Number(f.montantHt), tva: 20 }]
        : []),
    createdAt: f.createdAt.toISOString(),
  }));

  const actives = list.filter(ACTIVE);
  const ttcFacture = r2(actives.reduce((a, f) => a + f.montantTtc, 0));
  const reste = devisRef ? resteParTaux(devisRef.lignes, actives) : new Map<number, number>();
  const resteTtc = devisRef ? Math.max(0, r2(devisRef.ttc - ttcFacture)) : 0;

  return {
    devisRef,
    raison,
    factures: list,
    ttcFacture,
    resteTtc,
    resteParTaux: [...reste.entries()].map(([taux, ht]) => ({ taux, ht: r2(ht) })),
    echeancier: echeancierPct(),
    syncError,
  };
}
