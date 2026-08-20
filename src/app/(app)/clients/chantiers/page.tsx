import { asc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { leads as leadsTable, stages as stagesTable } from "@/db/schema";
import { ClientsNav } from "../clients-nav";
import { ChantiersBoard, type ChantierCard } from "./chantiers-board";

export const dynamic = "force-dynamic";

export default async function ChantiersPage() {
  const [clients, chantierStages] = await Promise.all([
    db.query.leads.findMany({
      where: eq(leadsTable.statut, "gagnee"),
      with: { stage: true, responsable: true, poseur: true },
      orderBy: (l, { desc }) => [desc(l.dateSignature), desc(l.createdAt)],
    }),
    // Colonnes du board : « Signée » (entrée) + toutes les étapes du cycle 3.
    db
      .select()
      .from(stagesTable)
      .where(or(eq(stagesTable.isGagnee, true), eq(stagesTable.cycle, 3)))
      .orderBy(asc(stagesTable.position)),
  ]);

  const cards: ChantierCard[] = clients.map((l) => {
    const ttc = l.montantTtc ? Number(l.montantTtc) : l.montant ? Number(l.montant) : 0;
    const enc = (l.acompteEncaisse ? Number(l.acompteEncaisse) : 0) + (l.paiementEspece ? Number(l.paiementEspece) : 0);
    return {
      id: l.id,
      stageId: l.stageId,
      nom: l.nom,
      ville: l.ville,
      codePostal: l.codePostal,
      equipePose: l.equipePose ?? l.poseur?.nom ?? l.poseur?.email ?? null,
      dateMetre: l.dateMetre,
      datePosePrevue: l.datePosePrevue,
      datePoseReelle: l.datePoseReelle,
      reste: Math.max(0, ttc - enc),
      factureSoldeClient: l.factureSoldeClient,
      factureSoldePoseur: l.factureSoldePoseur,
    };
  });

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <ClientsNav />
      <div className="flex items-baseline gap-3 px-6 pt-4 pb-3">
        <h1 className="text-display text-2xl">Chantiers</h1>
        <span className="text-sm text-muted-foreground">
          Suivi de pose · {cards.length} chantier{cards.length > 1 ? "s" : ""}
        </span>
      </div>
      <ChantiersBoard stages={chantierStages} cards={cards} />
    </main>
  );
}
