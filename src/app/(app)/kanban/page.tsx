import { asc } from "drizzle-orm";
import { db } from "@/db";
import { stages as stagesTable } from "@/db/schema";
import { KanbanBoard } from "./kanban-board";
import { MonthSelect } from "./month-select";

export const dynamic = "force-dynamic";

const MOIS_FR = [
  "JANVIER", "FÉVRIER", "MARS", "AVRIL", "MAI", "JUIN",
  "JUILLET", "AOÛT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DÉCEMBRE",
];

// "YYYY-MM" de la date de réception.
function ym(d: Date | string): string {
  return (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 7);
}
// "2026-06" → "JUIN 26".
function moisLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MOIS_FR[Number(m) - 1]} ${y.slice(2)}`;
}

export default async function KanbanPage({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string }>;
}) {
  const [sp, stages, allLeads] = await Promise.all([
    searchParams,
    db.select().from(stagesTable).orderBy(asc(stagesTable.position)),
    db.query.leads.findMany({
      with: { responsable: true, modifiePar: true },
      orderBy: (l, { desc }) => [desc(l.createdAt)],
    }),
  ]);

  // Mois présents (réception), du plus récent au plus ancien.
  const months = [...new Set(allLeads.map((l) => ym(l.createdAt)))].sort().reverse();
  const options = [
    { value: "tous", label: "Tous les mois" },
    ...months.map((m) => ({ value: m, label: moisLabel(m) })),
  ];

  const moisSel = sp.mois && /^\d{4}-\d{2}$/.test(sp.mois) ? sp.mois : "tous";
  const leads =
    moisSel === "tous"
      ? allLeads
      : allLeads.filter((l) => ym(l.createdAt) === moisSel);

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-6 pt-5">
        <h1 className="text-display text-2xl">Kanban</h1>
        <MonthSelect value={moisSel} options={options} />
      </div>
      {/* key = mois : force la ré-initialisation du board quand le filtre change */}
      <KanbanBoard key={moisSel} stages={stages} leads={leads} />
    </main>
  );
}
