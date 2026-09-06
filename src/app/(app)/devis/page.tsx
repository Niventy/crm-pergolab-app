import Link from "next/link";
import { FileText } from "lucide-react";
import { isNull } from "drizzle-orm";
import { db } from "@/db";
import { leads as leadsTable } from "@/db/schema";
import { formatEuros, formatHorodatage } from "@/lib/format";
import { DevisActions } from "./devis-actions";
import { NouveauDevisButton, type LeadPick } from "./nouveau-devis";

export const dynamic = "force-dynamic";

export default async function DevisPage() {
  const [devisAll, leadsRaw] = await Promise.all([
    db.query.devis.findMany({
      with: {
        lead: {
          columns: { id: true, nom: true, codePostal: true, email: true, deletedAt: true },
        },
      },
      orderBy: (d, { desc }) => [desc(d.createdAt)],
    }),
    db
      .select({
        id: leadsTable.id,
        nom: leadsTable.nom,
        codePostal: leadsTable.codePostal,
        email: leadsTable.email,
        statut: leadsTable.statut,
      })
      .from(leadsTable)
      .where(isNull(leadsTable.deletedAt))
      .orderBy(leadsTable.nom),
  ]);
  // Les devis d'une fiche en corbeille sont masqués avec elle.
  const devisList = devisAll.filter((d) => !d.lead?.deletedAt);
  const leadsPick: LeadPick[] = leadsRaw;

  // Totaux : les variantes « Non retenu » ne comptent pas (sinon CA fantôme
  // quand un devis a été dupliqué). Le signé est mis à part.
  const actifs = devisList.filter((d) => d.statut !== "Non retenu");
  const total = actifs.reduce((a, d) => a + Number(d.montant ?? 0), 0);
  const signes = devisList.filter((d) => d.accepteAt);
  const totalSigne = signes.reduce((a, d) => a + Number(d.montant ?? 0), 0);

  const STATUT_CLS: Record<string, string> = {
    Brouillon: "bg-slate-100 text-slate-600",
    Envoyé: "bg-sky-100 text-sky-700",
    Accepté: "bg-green-600 text-white",
    "Non retenu": "bg-slate-100 text-slate-400 line-through",
  };

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-6 py-6 pb-28">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-brand text-brand-foreground">
          <FileText className="size-5" />
        </span>
        <div>
          <h1 className="text-display text-2xl">Devis</h1>
          <p className="text-sm text-muted-foreground">
            {devisList.length} devis · {formatEuros(String(total))} HT en jeu (hors
            variantes non retenues) · {signes.length} signé{signes.length > 1 ? "s" : ""} ={" "}
            {formatEuros(String(totalSigne))} HT
          </p>
        </div>
        <div className="ml-auto">
          <NouveauDevisButton leads={leadsPick} />
        </div>
      </div>

      {devisList.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-16 text-center text-sm text-muted-foreground">
          Aucun devis pour l&apos;instant. Clique sur « Créer un devis » et choisis
          le client concerné.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted text-left text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="border-b border-border px-3 py-2">Numéro</th>
                <th className="border-b border-border px-3 py-2">Client</th>
                <th className="border-b border-border px-3 py-2">Code postal</th>
                <th className="border-b border-border px-3 py-2">Email</th>
                <th className="border-b border-border px-3 py-2 text-right">HT</th>
                <th className="border-b border-border px-3 py-2 text-right">TTC</th>
                <th className="border-b border-border px-3 py-2">Statut</th>
                <th className="border-b border-border px-3 py-2">Créé le</th>
                <th className="border-b border-border px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {devisList.map((d) => (
                <tr
                  key={d.id}
                  className="border-t border-border bg-white transition-colors hover:bg-primary/[0.04]"
                >
                  <td className="px-3 py-2 font-medium text-foreground">
                    {d.lead ? (
                      <Link
                        href={`/leads/${d.lead.id}/devis/${d.id}`}
                        className="hover:underline"
                      >
                        {d.numero ?? "Devis"}
                      </Link>
                    ) : (
                      (d.numero ?? "Devis")
                    )}
                  </td>
                  <td className="px-3 py-2 text-foreground">
                    {d.lead ? (
                      <Link
                        href={`/leads/${d.lead.id}/devis/${d.id}`}
                        className="font-medium hover:underline"
                      >
                        {d.lead.nom}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {d.lead?.codePostal ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {d.lead?.email ? (
                      <a
                        href={`mailto:${d.lead.email}`}
                        className="hover:text-primary hover:underline"
                      >
                        {d.lead.email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatEuros(d.montant)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatEuros(d.montantTtc)}
                  </td>
                  <td className="px-3 py-2">
                    {d.accepteAt ? (
                      <span className="rounded-md bg-green-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        Signé
                      </span>
                    ) : d.statut ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${STATUT_CLS[d.statut] ?? "bg-muted text-muted-foreground"}`}
                      >
                        {d.statut}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {formatHorodatage(d.createdAt)}
                  </td>
                  <td className="px-3 py-2">
                    {d.lead ? (
                      <DevisActions
                        externalId={d.externalId}
                        leadId={d.lead.id}
                        devisId={d.id}
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
