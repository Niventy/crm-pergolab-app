import { notFound } from "next/navigation";
import { Euro } from "lucide-react";
import { db } from "@/db";
import { getStats, compact } from "../dashboard/data";
import { Kpi, Panel, EnTete } from "../dashboard/ui";
import { ObjectifsAdmin } from "../dashboard/objectifs-admin";

export const dynamic = "force-dynamic";

export default async function ComptabilitePage({
  searchParams,
}: {
  searchParams: Promise<{ adv?: string; mois?: string }>;
}) {
  const sp = await searchParams;
  const s = await getStats(sp);

  // Page réservée : un ADV ne doit même pas pouvoir l'atteindre à l'URL.
  if (!s.admin) notFound();

  const profils = await db.query.profiles.findMany({
    orderBy: (p, { asc }) => [asc(p.nom)],
  });

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-5 px-6 py-6 pb-28">
      <EnTete
        titre="Comptabilité"
        sous={`CA, marge, encaissements par DATE DE SIGNATURE · ${s.periodeLabel}`}
        Icon={Euro}
        basePath="/comptabilite"
        moisSel={s.moisSel}
        periodOptions={s.periodOptions}
        scopeSel={s.scopeSel}
        scopes={s.scopes}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="CA signé (HT)"
          value={compact(s.ca)}
          color="text-green-700"
          sub={`${s.signes.length} signature${s.signes.length > 1 ? "s" : ""}`}
        />
        <Kpi
          label="Marge générée"
          value={compact(s.marge)}
          sub={`${s.margePct} % du CA`}
          color="text-green-700"
        />
        <Kpi
          label="Encaissé"
          value={compact(s.encaisse)}
          sub="acomptes + espèces des commandes signées"
          color="text-green-700"
        />
        <Kpi label="Panier moyen signé" value={compact(s.panierMoyen)} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Devis en attente"
          value={compact(s.devisMontant)}
          sub={`${s.devisEnAttente.length} devis envoyé${s.devisEnAttente.length > 1 ? "s" : ""}`}
          color="text-blue-700"
        />
        <Kpi
          label="Pipeline en cours"
          value={compact(s.pipeline)}
          sub={`${s.enCours.length} actif${s.enCours.length > 1 ? "s" : ""}`}
          color="text-blue-700"
        />
        <Kpi
          label="Signés (cohorte)"
          value={String(s.won.length)}
          sub={`sur ${s.recus} lead${s.recus > 1 ? "s" : ""} reçus sur la période`}
        />
        <Kpi label="Taux de closing" value={`${s.closing} %`} sub="leads reçus sur la période" />
      </div>

      {/* Marge par produit — où l'argent se gagne réellement */}
      <Panel title={`Marge par produit (gamme) — ${s.periodeLabel}`}>
        {s.margeParProduit.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune signature sur la période — la marge se calcule sur le CA
            signé.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                <th className="pb-2 font-semibold">Gamme</th>
                <th className="pb-2 text-right font-semibold">Signés</th>
                <th className="pb-2 text-right font-semibold">CA HT</th>
                <th className="pb-2 text-right font-semibold">Coût</th>
                <th className="pb-2 text-right font-semibold">Marge</th>
                <th className="pb-2 text-right font-semibold">%</th>
              </tr>
            </thead>
            <tbody>
              {s.margeParProduit.map((p) => (
                <tr key={p.gamme} className="border-t border-border">
                  <td className="py-2 font-medium text-foreground">{p.gamme}</td>
                  <td className="py-2 text-right tabular-nums">{p.nb}</td>
                  <td className="py-2 text-right tabular-nums">{compact(p.ca)}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">
                    {compact(p.cout)}
                  </td>
                  <td className="py-2 text-right font-medium tabular-nums text-green-700">
                    {compact(p.marge)}
                  </td>
                  <td
                    className={`py-2 text-right tabular-nums ${
                      p.pct < 30 ? "text-orange-600" : "text-foreground"
                    }`}
                  >
                    {p.pct} %
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Le coût vient du champ « Coût d&apos;achat fournisseur » de la fiche — sans
          lui, la marge affichée est égale au CA.
        </p>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title={`CA par ADV — ${s.periodeLabel}`}>
          {s.advs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun lead sur la période.</p>
          ) : (
            <ul className="space-y-2">
              {s.advs.map((a) => (
                <li key={a.nom} className="flex items-center gap-3 text-sm">
                  <span className="w-32 shrink-0 truncate text-foreground">{a.nom}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-green-600"
                      style={{ width: `${(a.ca / s.caAdvMax) * 100}%` }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right tabular-nums text-green-700">
                    {compact(a.ca)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Performance par ADV">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                <th className="pb-2 font-semibold">ADV</th>
                <th className="pb-2 text-right font-semibold">Leads reçus</th>
                <th className="pb-2 text-right font-semibold">CA signé</th>
                <th className="pb-2 text-right font-semibold">Closing</th>
              </tr>
            </thead>
            <tbody>
              {s.advs.map((a) => {
                const cl =
                  a.won + a.perdu > 0
                    ? Math.round((a.won / (a.won + a.perdu)) * 100)
                    : 0;
                return (
                  <tr key={a.nom} className="border-t border-border">
                    <td className="py-2 font-medium text-foreground">{a.nom}</td>
                    <td className="py-2 text-right tabular-nums">{a.leads}</td>
                    <td className="py-2 text-right tabular-nums text-green-700">
                      {compact(a.ca)}
                    </td>
                    <td className="py-2 text-right tabular-nums">{cl} %</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>

      </div>

      <Panel title="Objectifs mensuels de l'équipe">
        <p className="mb-3 text-xs text-muted-foreground">
          Chaque ADV voit sa progression (CA / objectif) sur son dashboard.
        </p>
        <ObjectifsAdmin profils={profils} />
      </Panel>
    </main>
  );
}
