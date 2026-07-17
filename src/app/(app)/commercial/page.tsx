import { Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStats, compact, MOIS } from "../dashboard/data";
import { Kpi, Panel, EnTete } from "../dashboard/ui";
import { AgendaLeads } from "../dashboard/agenda-leads";
import { BarParMois } from "../dashboard/dashboard-charts";
import { CarteFrance } from "../dashboard/carte-france";

export const dynamic = "force-dynamic";

export default async function CommercialPage({
  searchParams,
}: {
  searchParams: Promise<{ adv?: string; mois?: string }>;
}) {
  const sp = await searchParams;
  const s = await getStats(sp);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-5 px-6 py-6 pb-28">
      <EnTete
        titre="Commercial"
        sous={`D'où viennent les leads et où ils bloquent · ${s.periodeLabel}`}
        Icon={Target}
        basePath="/commercial"
        moisSel={s.moisSel}
        periodOptions={s.periodOptions}
        scopeSel={s.scopeSel}
        scopes={s.scopes}
      />

      {/* Mes chiffres : ce que le compte connecté a généré lui-même */}
      <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-4">
        <h2 className="text-eyebrow mb-3 text-primary">
          Mes chiffres · {s.periodeLabel}
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Mon CA généré (HT)" value={compact(s.monCa)} color="text-green-700" />
          <Kpi label="Mes leads reçus" value={String(s.mesLeads.length)} />
          <Kpi label="Mes signés" value={String(s.mesWon.length)} />
          <Kpi
            label="Mon taux de closing"
            value={`${s.monClosing} %`}
            sub="signés / (signés + perdus)"
          />
        </div>
        {s.monObjectif > 0 ? (
          <div className="mt-3">
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="font-medium text-foreground">
                Objectif du mois : {compact(s.monCa)} / {compact(s.monObjectif)}
              </span>
              <span className="text-muted-foreground">{s.monPct} %</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full",
                  s.monPct >= 100 ? "bg-green-600" : "bg-primary",
                )}
                style={{ width: `${Math.min(100, s.monPct)}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Leads reçus" value={String(s.recus)} />
        <Kpi
          label="Pipeline en cours"
          value={compact(s.pipeline)}
          sub={`${s.enCours.length} actif${s.enCours.length > 1 ? "s" : ""}`}
          color="text-blue-700"
        />
        <Kpi
          label="Devis en attente"
          value={compact(s.devisMontant)}
          sub={`${s.devisEnAttente.length} devis envoyé${s.devisEnAttente.length > 1 ? "s" : ""}`}
          color="text-blue-700"
        />
        <Kpi
          label="Taux de closing"
          value={`${s.closing} %`}
          sub={`${s.won.length} signé${s.won.length > 1 ? "s" : ""} · ${s.perdu.length} perdu${s.perdu.length > 1 ? "s" : ""}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title={`Leads reçus par mois — ${s.year}`} className="lg:col-span-2">
          <BarParMois
            data={s.serie}
            moisActif={s.moisActif}
            unite="nombre"
            libelle="Leads reçus"
          />
        </Panel>

        <Panel title={`Entonnoir — ${s.periodeLabel}`}>
          <ul className="space-y-2">
            {s.funnel.map((f) => {
              const pct = s.recus ? Math.round((f.v / s.recus) * 100) : 0;
              return (
                <li key={f.label}>
                  <div className="mb-0.5 flex justify-between text-xs">
                    <span className="text-foreground">{f.label}</span>
                    <span className="text-muted-foreground">
                      {f.v} · {pct} %
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <Panel title={`Leads reçus par jour — ${MOIS[s.calMonth]} ${s.year}`}>
        <AgendaLeads
          year={s.year}
          month={s.calMonth}
          counts={s.calCounts}
          max={s.calMax}
        />
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title={`Leads par région — ${s.periodeLabel}`}>
          <CarteFrance counts={s.regionCounts} horsMetropole={s.horsMetropole} />
        </Panel>

        <Panel title="Leads par source">
          {s.sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun lead sur la période.</p>
          ) : (
            <ul className="space-y-2">
              {s.sources.map((src) => (
                <li key={src.label} className="flex items-center gap-3 text-sm">
                  <span className="w-40 shrink-0 truncate text-foreground">
                    {src.label}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${(src.v / s.srcMax) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-muted-foreground">
                    {src.v}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </main>
  );
}
