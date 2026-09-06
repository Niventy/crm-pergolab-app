import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leads as leadsTable, devis as devisTable } from "@/db/schema";
import {
  getDescriptionsSurMesure,
  getProduitsCatalogue,
} from "@/app/(app)/reglages/actions";
import { getQuoteStatus } from "@/lib/pennylane";
import { DevisForm, type DevisConfig } from "./devis-form";

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

  // Descriptions pré-stockées par composant sur-mesure (injectées sur les lignes)
  // + catalogue de produits, + statut Pennylane du devis (verrou si signé).
  const [surMesureDescriptions, catalogue, statutPl] = await Promise.all([
    getDescriptionsSurMesure(),
    getProduitsCatalogue(),
    devisRow?.externalId ? getQuoteStatus(devisRow.externalId) : Promise.resolve(null),
  ]);

  // Verrou : devis accepté dans le CRM, ou accepté/signé/facturé côté Pennylane.
  const verrou = devisRow?.accepteAt
    ? { actif: true, motif: "Signé par le client : le contenu ne peut plus changer." }
    : statutPl?.ok && statutPl.verrouille
      ? {
          actif: true,
          motif: `Statut Pennylane « ${statutPl.status ?? "verrouillé"} » : le contenu ne peut plus changer.`,
        }
      : null;

  const statutAffiche = devisRow?.accepteAt ? "Signé" : (devisRow?.statut ?? null);

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-3 px-4 pt-4 pb-28">
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
        {statutAffiche ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {statutAffiche}
          </span>
        ) : null}
      </div>

      <DevisForm
        leadId={id}
        devisId={devisRow?.id ?? null}
        quoteId={devisRow?.externalId ?? null}
        numero={devisRow?.numero ?? null}
        statut={statutAffiche}
        pennylaneConfigured={!!process.env.PENNYLANE_API_KEY}
        surMesureDescriptions={surMesureDescriptions}
        catalogue={catalogue}
        config={(devisRow?.config as DevisConfig | null) ?? null}
        lignesSnapshot={
          (devisRow?.lignes as
            | { designation: string; description?: string | null; quantite: number; prixHt: number; tva: number; remisePct?: number | null; productId?: number | null }[]
            | null) ?? null
        }
        verrou={verrou}
        client={{
          nom: lead.nom,
          entreprise: lead.entreprise,
          siret: lead.siret,
          tvaIntracom: lead.tvaIntracom,
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
