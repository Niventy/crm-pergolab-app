import { FileText } from "lucide-react";
import { db } from "@/db";
import { formatEuros, formatHorodatage } from "@/lib/format";
import { DevisActions } from "./devis-actions";

export const dynamic = "force-dynamic";

export default async function DevisPage() {
  const devisList = await db.query.devis.findMany({
    with: { lead: { columns: { id: true, nom: true } } },
    orderBy: (d, { desc }) => [desc(d.createdAt)],
  });

  const total = devisList.reduce((a, d) => a + Number(d.montant ?? 0), 0);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-6 py-6 pb-28">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-brand text-brand-foreground">
          <FileText className="size-5" />
        </span>
        <div>
          <h1 className="text-display text-2xl">Devis</h1>
          <p className="text-sm text-muted-foreground">
            {devisList.length} devis · {formatEuros(String(total))} HT au total
          </p>
        </div>
      </div>

      {devisList.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-16 text-center text-sm text-muted-foreground">
          Aucun devis pour l&apos;instant. Crée-en un depuis la section « Devis »
          d&apos;une fiche prospect.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted text-left text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="border-b border-border px-3 py-2">Numéro</th>
                <th className="border-b border-border px-3 py-2">Client</th>
                <th className="border-b border-border px-3 py-2 text-right">Montant HT</th>
                <th className="border-b border-border px-3 py-2">Statut</th>
                <th className="border-b border-border px-3 py-2">Créé le</th>
                <th className="border-b border-border px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {devisList.map((d) => (
                <tr key={d.id} className="border-t border-border bg-white">
                  <td className="px-3 py-2 font-medium text-foreground">
                    {d.numero ?? "Devis"}
                  </td>
                  <td className="px-3 py-2 text-foreground">
                    {d.lead?.nom ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatEuros(d.montant)}
                  </td>
                  <td className="px-3 py-2">
                    {d.statut ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
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
                      <DevisActions externalId={d.externalId} leadId={d.lead.id} />
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
