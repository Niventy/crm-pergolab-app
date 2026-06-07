import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leads as leadsTable } from "@/db/schema";
import { EditForm } from "./edit-form";

export const dynamic = "force-dynamic";

export default async function EditLeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [lead, stages, profiles] = await Promise.all([
    db.query.leads.findFirst({ where: eq(leadsTable.id, id) }),
    db.query.stages.findMany({ orderBy: (s, { asc }) => [asc(s.position)] }),
    db.query.profiles.findMany({ orderBy: (p, { asc }) => [asc(p.nom)] }),
  ]);

  if (!lead) notFound();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-4 px-6 py-6">
      <div>
        <Link
          href={`/leads/${lead.id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Retour à la fiche
        </Link>
        <h1 className="text-display mt-2 text-2xl">Modifier {lead.nom}</h1>
      </div>

      <EditForm lead={lead} stages={stages} profiles={profiles} />
    </main>
  );
}
