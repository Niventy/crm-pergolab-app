import { CommandesTable } from "../clients-table";
import { ClientsNav } from "../clients-nav";
import { getClients, type Phase } from "../phases";

export const dynamic = "force-dynamic";

const PHASES: Phase[] = ["commande", "facturation", "sav"];

// Vue tableau des clients (même données que le Kanban), avec un filtre
// d'encaissement pré-appliqué via ?enc=commande|facturation|sav.
export default async function ClientsTableauPage({
  searchParams,
}: {
  searchParams: Promise<{ enc?: string }>;
}) {
  const [{ rows, stageOptions, admin, userId }, sp] = await Promise.all([
    getClients(),
    searchParams,
  ]);
  const enc = PHASES.includes(sp.enc as Phase) ? (sp.enc as Phase) : "all";
  const clients = rows.filter((r) => r.statut === "gagnee").length;

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <ClientsNav total={clients} />
      <div className="flex items-baseline gap-3 px-6 pt-4 pb-3">
        <h1 className="text-display text-2xl">Clients — tableau</h1>
        <span className="text-sm text-muted-foreground">
          Commandes signées · encaissements · dossier administratif
        </span>
      </div>
      <CommandesTable
        rows={rows}
        admin={admin}
        currentUserId={userId}
        stages={stageOptions}
        initialEnc={enc}
      />
    </main>
  );
}
