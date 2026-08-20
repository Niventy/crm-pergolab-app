import { asc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { leads as leadsTable, stages as stagesTable } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/current-user";
import type { CommandeRow, StageOption } from "./clients-table";

// Les 3 phases du cycle client, déterminées AUTOMATIQUEMENT par l'encaissement.
export type Phase = "commande" | "facturation" | "sav";

export const PHASES: {
  key: Phase;
  href: string;
  label: string;
  titre: string;
  sousTitre: string;
}[] = [
  {
    key: "commande",
    href: "/clients",
    label: "Commande",
    titre: "Commandes client",
    sousTitre: "Commandes signées à traiter (devis → facture)",
  },
  {
    key: "facturation",
    href: "/clients/facturation",
    label: "Facturation",
    titre: "Facturation",
    sousTitre: "Acompte reçu · installation & facture finale en attente",
  },
  {
    key: "sav",
    href: "/clients/sav",
    label: "SAV",
    titre: "SAV",
    sousTitre: "Clients soldés · après-vente · CA réalisé",
  },
];

// Base à encaisser = TTC si connu, sinon HT.
export function phaseDe(r: {
  montantHt: number | null;
  montantTtc: number | null;
  acompteEncaisse: number | null;
  paiementEspece: number | null;
}): Phase {
  const ttc = r.montantTtc ?? r.montantHt ?? 0;
  const enc = (r.acompteEncaisse ?? 0) + (r.paiementEspece ?? 0);
  if (enc <= 0) return "commande"; // rien encaissé → à traiter/facturer
  if (ttc - enc > 0.5) return "facturation"; // acompte reçu, solde dû
  return "sav"; // soldé (payé à 100 %)
}

// Charge tous les clients (gagnés) + calcule leur phase + les étapes de chantier.
export async function getClients() {
  const [commandes, chantierStages, admin, supabase] = await Promise.all([
    db.query.leads.findMany({
      where: eq(leadsTable.statut, "gagnee"),
      with: { stage: true, responsable: true, poseur: true },
      orderBy: (l, { desc }) => [desc(l.dateSignature), desc(l.createdAt)],
    }),
    db
      .select({ id: stagesTable.id, nom: stagesTable.nom, couleur: stagesTable.couleur })
      .from(stagesTable)
      .where(or(eq(stagesTable.isGagnee, true), eq(stagesTable.cycle, 3)))
      .orderBy(asc(stagesTable.position)),
    isAdmin(),
    createClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const rows: (CommandeRow & { phase: Phase })[] = commandes.map((l) => {
    const row: CommandeRow = {
      id: l.id,
      dateCde: l.dateSignature ?? new Date(l.createdAt).toISOString().slice(0, 10),
      commercial: l.responsable?.nom ?? l.responsable?.email ?? null,
      assignedTo: l.assignedTo,
      equipePose: l.equipePose ?? l.poseur?.nom ?? l.poseur?.email ?? null,
      nom: l.nom,
      codePostal: l.codePostal,
      ville: l.ville,
      produit: [l.gamme, l.dimensions].filter(Boolean).join(" ") || l.typeProjet || null,
      montantHt: l.montant ? Number(l.montant) : null,
      montantTtc: l.montantTtc ? Number(l.montantTtc) : null,
      acompteEncaisse: l.acompteEncaisse ? Number(l.acompteEncaisse) : null,
      paiementEspece: l.paiementEspece ? Number(l.paiementEspece) : null,
      montantAchat: admin && l.montantAchat ? Number(l.montantAchat) : null,
      financeur: l.financeur,
      modePaiement: l.modePaiement,
      factureSoldeClient: l.factureSoldeClient,
      factureSoldePoseur: l.factureSoldePoseur,
      dossierDateEnvoi: l.dossierDateEnvoi,
      datePoseReelle: l.datePoseReelle,
      stageId: l.stageId,
      stageNom: l.stage?.nom ?? null,
      stageCouleur: l.stage?.couleur ?? null,
    };
    return { ...row, phase: phaseDe(row) };
  });

  const counts: Record<Phase, number> = { commande: 0, facturation: 0, sav: 0 };
  for (const r of rows) counts[r.phase]++;

  const stageOptions: StageOption[] = chantierStages;
  return { rows, counts, stageOptions, admin, userId: user?.id ?? null };
}
