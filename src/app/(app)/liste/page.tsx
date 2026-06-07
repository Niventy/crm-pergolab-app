import { asc } from "drizzle-orm";
import { db } from "@/db";
import { stages as stagesTable } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { ListeTable } from "./liste-table";

export const dynamic = "force-dynamic";

export default async function ListePage() {
  const [leads, stages, supabase] = await Promise.all([
    db.query.leads.findMany({
      with: { stage: true, responsable: true },
      orderBy: (l, { desc }) => [desc(l.createdAt)],
    }),
    db.select().from(stagesTable).orderBy(asc(stagesTable.position)),
    createClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-baseline gap-3 px-6 pt-5 pb-3">
        <h1 className="text-display text-2xl">Liste</h1>
        <span className="text-sm text-muted-foreground">
          {leads.length} prospect{leads.length > 1 ? "s" : ""}
        </span>
      </div>
      <ListeTable leads={leads} stages={stages} currentUserId={user?.id ?? null} />
    </main>
  );
}
