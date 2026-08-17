import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leads as leadsTable, devis as devisTable } from "@/db/schema";
import { getMappingSurMesure } from "@/app/(app)/reglages/actions";
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
    with: { stage: true, responsable: true },
  });
  if (!lead) notFound();

  const isNew = devisId === "nouveau";
  const devisRow = isNew
    ? null
    : await db.query.devis.findFirst({ where: eq(devisTable.id, devisId) });
  if (!isNew && !devisRow) notFound();

  // Mapping composant sur-mesure → produit Pennylane (pour les descriptions).
  const rawMap = await getMappingSurMesure();
  const surMesureMapping: Record<string, number> = {};
  for (const [k, v] of Object.entries(rawMap)) {
    const n = Number(v);
    if (n) surMesureMapping[k] = n;
  }

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
        surMesureMapping={surMesureMapping}
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
        infos={{
          typeProjet: lead.typeProjet,
          dimensions: lead.dimensions,
          gamme: lead.gamme,
          dateSouhaiteeAppel: lead.dateSouhaiteeAppel,
          dateInstallation: lead.dateInstallation,
          etape: lead.stage?.nom ?? null,
          responsable: lead.responsable?.nom ?? lead.responsable?.email ?? null,
          rdvDate: lead.rdvDate,
          rdvHeure: lead.rdvHeure,
        }}
      />
    </main>
  );
}
