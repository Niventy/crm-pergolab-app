import { asc, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { stages as stagesTable, leads as leadsTable } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/current-user";
import { NouveauProspect } from "@/components/nouveau-prospect";
import { ListeTable } from "./liste-table";

export const dynamic = "force-dynamic";

export default async function ListePage() {
  const [leads, stages, profiles, supabase, admin] = await Promise.all([
    db.query.leads.findMany({
      where: isNull(leadsTable.deletedAt),
      with: { stage: true, responsable: true },
      orderBy: (l, { desc }) => [desc(l.createdAt)],
    }),
    db.select().from(stagesTable).orderBy(asc(stagesTable.position)),
    db.query.profiles.findMany({ orderBy: (p, { asc }) => [asc(p.nom)] }),
    createClient(),
    isAdmin(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Corbeille (fiches supprimées, restaurables) : admin uniquement.
  const corbeille = admin
    ? await db.query.leads.findMany({
        where: isNotNull(leadsTable.deletedAt),
        with: { stage: true, responsable: true },
        orderBy: (l, { desc }) => [desc(l.deletedAt)],
      })
    : [];

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-baseline gap-3 px-6 pt-5 pb-3">
        <h1 className="text-display text-2xl">Liste</h1>
        <span className="text-sm text-muted-foreground">
          {leads.length} prospect{leads.length > 1 ? "s" : ""}
        </span>
        <div className="ml-auto self-center">
          <NouveauProspect profiles={profiles} currentUserId={user?.id ?? null} />
        </div>
      </div>
      <ListeTable
        leads={leads}
        corbeille={corbeille}
        stages={stages}
        currentUserId={user?.id ?? null}
        admin={admin}
      />
    </main>
  );
}
