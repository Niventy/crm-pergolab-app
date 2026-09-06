import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { leads as leadsTable, stages as stagesTable } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/current-user";
import { CYCLE_CHANTIER } from "@/lib/pipeline";
import { phaseDe, type CommandeRow, type Phase, type StageOption } from "./phases-meta";

// Requêtes serveur de l'espace Clients. Types, badges et règle d'encaissement
// sont dans ./phases-meta.ts (importable côté client).
export type { Phase, CommandeRow, StageOption } from "./phases-meta";
export { PHASE_META, PHASE_ORDER, phaseDe } from "./phases-meta";

// Charge les clients : fiches gagnées + fiches sur une étape de chantier (dont
// « Annulée », pour qu'une commande annulée reste visible dans son Kanban).
export async function getClients() {
  const [chantierStages, admin, supabase] = await Promise.all([
    db
      .select({
        id: stagesTable.id,
        nom: stagesTable.nom,
        couleur: stagesTable.couleur,
        position: stagesTable.position,
        isPerdue: stagesTable.isPerdue,
      })
      .from(stagesTable)
      .where(eq(stagesTable.cycle, CYCLE_CHANTIER))
      .orderBy(asc(stagesTable.position)),
    isAdmin(),
    createClient(),
  ]);
  const chantierIds = chantierStages.map((s) => s.id);

  const [commandes, userRes] = await Promise.all([
    db.query.leads.findMany({
      where: and(
        isNull(leadsTable.deletedAt),
        chantierIds.length
          ? or(eq(leadsTable.statut, "gagnee"), inArray(leadsTable.stageId, chantierIds))
          : eq(leadsTable.statut, "gagnee"),
      ),
      with: { stage: true, responsable: true, poseur: true },
      orderBy: (l, { desc }) => [desc(l.dateSignature), desc(l.createdAt)],
    }),
    supabase.auth.getUser(),
  ]);
  const user = userRes.data.user;

  const rows: CommandeRow[] = commandes.map((l) => {
    const base = {
      montantTtc: l.montantTtc ? Number(l.montantTtc) : null,
      acompteEncaisse: l.acompteEncaisse ? Number(l.acompteEncaisse) : null,
      paiementEspece: l.paiementEspece ? Number(l.paiementEspece) : null,
    };
    return {
      id: l.id,
      dateCde: l.dateSignature ?? new Date(l.createdAt).toISOString().slice(0, 10),
      statut: l.statut,
      commercial: l.responsable?.nom ?? l.responsable?.email ?? null,
      assignedTo: l.assignedTo,
      poseAssignedTo: l.poseAssignedTo,
      equipePose: l.equipePose ?? l.poseur?.nom ?? l.poseur?.email ?? null,
      nom: l.nom,
      telephone: l.telephone,
      codePostal: l.codePostal,
      ville: l.ville,
      produit: [l.gamme, l.dimensions].filter(Boolean).join(" ") || l.typeProjet || null,
      montantHt: l.montant ? Number(l.montant) : null,
      ...base,
      montantAchat: admin && l.montantAchat ? Number(l.montantAchat) : null,
      financeur: l.financeur,
      modePaiement: l.modePaiement,
      factureSoldeClient: l.factureSoldeClient,
      factureSoldePoseur: l.factureSoldePoseur,
      dossierDateEnvoi: l.dossierDateEnvoi,
      dateMetre: l.dateMetre,
      dateLivraisonPrevue: l.dateLivraisonPrevue,
      datePosePrevue: l.datePosePrevue,
      datePoseReelle: l.datePoseReelle,
      updatedAt: new Date(l.updatedAt).toISOString(),
      stageId: l.stageId,
      stageNom: l.stage?.nom ?? null,
      stageCouleur: l.stage?.couleur ?? null,
      phase: phaseDe(base),
    };
  });

  const counts: Record<Phase, number> = { commande: 0, facturation: 0, sav: 0 };
  for (const r of rows) if (r.statut === "gagnee") counts[r.phase]++;

  const stageOptions: StageOption[] = chantierStages;
  return { rows, counts, stageOptions, admin, userId: user?.id ?? null };
}
