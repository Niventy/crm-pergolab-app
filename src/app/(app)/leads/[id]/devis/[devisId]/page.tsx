import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leads as leadsTable, devis as devisTable } from "@/db/schema";
import { DevisForm } from "./devis-form";

export const dynamic = "force-dynamic";

export default async function DevisEditPage({
  params,
}: {
  params: Promise<{ id: string; devisId: string }>;
}) {
  const { id, devisId } = await params;

  const lead = await db.query.leads.findFirst({
    where: eq(leadsTable.id, id),
  });
  if (!lead) notFound();

  const isNew = devisId === "nouveau";
  const devisRow = isNew
    ? null
    : await db.query.devis.findFirst({ where: eq(devisTable.id, devisId) });
  if (!isNew && !devisRow) notFound();

  return (
    <main className="flex w-full flex-1 flex-col gap-3 px-4 py-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <Link
          href={`/leads/${id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Retour à la fiche
        </Link>
        <h1 className="text-display text-xl">
          {isNew ? "Nouveau devis" : `Devis ${devisRow?.numero ?? ""}`}
        </h1>
        <p className="text-sm text-muted-foreground">{lead.nom}</p>
      </div>

      <DevisForm
        leadId={id}
        devisId={devisRow?.id ?? null}
        quoteId={devisRow?.externalId ?? null}
        numero={devisRow?.numero ?? null}
        pennylaneConfigured={!!process.env.PENNYLANE_API_KEY}
        prefill={{
          designation:
            `Pergola${lead.gamme ? ` ${lead.gamme}` : ""}${
              lead.dimensions ? ` ${lead.dimensions}` : ""
            }`.trim() || "Pergola sur mesure",
          prixHt: Number(lead.montant ?? 0) || 0,
        }}
        client={{
          nom: lead.nom,
          email: lead.email,
          telephone: lead.telephone,
          adresse: lead.adresse,
          ville: lead.ville,
          codePostal: lead.codePostal,
        }}
      />
    </main>
  );
}
