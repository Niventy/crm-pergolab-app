import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leads as leadsTable } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/current-user";
import { CommandesTable, type CommandeRow } from "./clients-table";

export const dynamic = "force-dynamic";

// Date de la commande = signature (sinon réception).
function dateCde(l: { dateSignature: string | null; createdAt: Date }): string {
  if (l.dateSignature) return l.dateSignature;
  return new Date(l.createdAt).toISOString().slice(0, 10);
}

export default async function ClientsPage() {
  const [commandes, admin, supabase] = await Promise.all([
    db.query.leads.findMany({
      where: eq(leadsTable.statut, "gagnee"),
      with: { stage: true, responsable: true, poseur: true },
      orderBy: (l, { desc }) => [desc(l.dateSignature), desc(l.createdAt)],
    }),
    isAdmin(),
    createClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const rows: CommandeRow[] = commandes.map((l) => ({
    id: l.id,
    dateCde: dateCde(l),
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
    stageNom: l.stage?.nom ?? null,
    stageCouleur: l.stage?.couleur ?? null,
  }));

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-baseline gap-3 px-6 pt-5 pb-3">
        <h1 className="text-display text-2xl">Clients</h1>
        <span className="text-sm text-muted-foreground">
          Suivi des commandes · {rows.length} commande{rows.length > 1 ? "s" : ""}
        </span>
      </div>
      <CommandesTable rows={rows} admin={admin} currentUserId={user?.id ?? null} />
    </main>
  );
}
