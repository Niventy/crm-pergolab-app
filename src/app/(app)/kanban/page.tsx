import { asc, isNull } from "drizzle-orm";
import { db } from "@/db";
import { stages as stagesTable, leads as leadsTable } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { ymParis, moisLabelFr } from "@/lib/format";
import { NouveauProspect } from "@/components/nouveau-prospect";
import { KanbanBoard } from "./kanban-board";
import { MonthSelect } from "./month-select";

export const dynamic = "force-dynamic";

// "YYYY-MM" de la date de réception, en heure de Paris (pas UTC).
const ym = ymParis;
// "2026-06" → "JUIN 2026" (libellé partagé Kanban / Liste / Clients).
const moisLabel = (key: string) => moisLabelFr(key);

export default async function KanbanPage({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string }>;
}) {
  const [sp, allStages, everyLead, profiles, supabase] = await Promise.all([
    searchParams,
    db.select().from(stagesTable).orderBy(asc(stagesTable.position)),
    db.query.leads.findMany({
      where: isNull(leadsTable.deletedAt),
      with: { responsable: true, modifiePar: true },
      orderBy: (l, { desc }) => [desc(l.createdAt)],
    }),
    db.query.profiles.findMany({ orderBy: (p, { asc }) => [asc(p.nom)] }),
    createClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Le Kanban est le pipeline COMMERCIAL : uniquement cycles 1 & 2, et une fiche
  // SIGNÉE le quitte (elle devient un client → espace Clients / Chantiers).
  const stages = allStages.filter((s) => s.cycle <= 2);
  const allLeads = everyLead.filter((l) => l.statut !== "gagnee");

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
        <div className="ml-auto">
          <NouveauProspect profiles={profiles} currentUserId={user?.id ?? null} />
        </div>
      </div>
      {/* key = mois : force la ré-initialisation du board quand le filtre change */}
      <KanbanBoard key={moisSel} stages={stages} leads={leads} />
    </main>
  );
}
