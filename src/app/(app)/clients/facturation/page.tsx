import { CommandesTable } from "../clients-table";
import { ClientsNav } from "../clients-nav";
import { getClients, PHASES } from "../phases";

export const dynamic = "force-dynamic";

export default async function FacturationPage() {
  const { rows, counts, stageOptions, admin, userId } = await getClients();
  const meta = PHASES.find((p) => p.key === "facturation")!;
  const list = rows.filter((r) => r.phase === "facturation");

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <ClientsNav counts={counts} />
      <div className="flex items-baseline gap-3 px-6 pt-4 pb-3">
        <h1 className="text-display text-2xl">{meta.titre}</h1>
        <span className="text-sm text-muted-foreground">
          {meta.sousTitre} · {list.length}
        </span>
      </div>
      <CommandesTable
        rows={list}
        admin={admin}
        currentUserId={userId}
        stages={stageOptions}
      />
    </main>
  );
}
