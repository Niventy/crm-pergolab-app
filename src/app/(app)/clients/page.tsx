import { ClientsBoard } from "./clients-board";
import { ClientsNav } from "./clients-nav";
import { getClients } from "./phases";

export const dynamic = "force-dynamic";

// Espace Clients = Kanban des chantiers (étapes du cycle 3). L'état
// d'encaissement est un badge / filtre sur chaque carte.
export default async function ClientsPage() {
  const { rows, stageOptions, userId } = await getClients();
  const clients = rows.filter((r) => r.statut === "gagnee").length;

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <ClientsNav total={clients} />
      <div className="flex items-baseline gap-3 px-6 pt-4">
        <h1 className="text-display text-2xl">Clients</h1>
        <span className="text-sm text-muted-foreground">
          Chantiers signés, du métré au SAV
        </span>
      </div>
      <ClientsBoard rows={rows} stages={stageOptions} currentUserId={userId} />
    </main>
  );
}
