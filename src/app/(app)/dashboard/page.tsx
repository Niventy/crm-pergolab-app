import Link from "next/link";
import { LineChart, Target, Euro, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStats, compact } from "./data";
import { Kpi, EnTete } from "./ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ adv?: string; mois?: string }>;
}) {
  const sp = await searchParams;
  const s = await getStats(sp);

  // Conserve la période / le périmètre quand on navigue vers les pages détaillées.
  const qs = (() => {
    const p = new URLSearchParams();
    if (s.scopeSel !== "all") p.set("adv", s.scopeSel);
    if (s.moisSel !== "annee") p.set("mois", s.moisSel);
    const q = p.toString();
    return q ? `?${q}` : "";
  })();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-5 px-6 py-6 pb-28">
      <EnTete
        titre="Indicateurs clés"
        sous={`Leads reçus · ${s.periodeLabel}`}
        Icon={LineChart}
        basePath="/dashboard"
        moisSel={s.moisSel}
        periodOptions={s.periodOptions}
        scopeSel={s.scopeSel}
        scopes={s.scopes}
      />

      {/* Mes stats (ADV) : ses chiffres + son objectif du mois */}
      {!s.admin ? (
        <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-4">
          <h2 className="text-eyebrow mb-3 text-primary">
            Mes stats · {s.periodeLabel}
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Mes leads reçus" value={String(s.mesLeads.length)} />
            <Kpi
              label="Mes signatures"
              value={String(s.mesSignes.length)}
              sub="signées sur la période"
            />
            <Kpi
              label="Mon CA signé (HT)"
              value={compact(s.monCa)}
              color="text-green-700"
              sub="par date de signature"
            />
            <Kpi
              label="Mon taux de closing"
              value={`${s.monClosing} %`}
              sub="signés / (signés + perdus), leads reçus"
            />
          </div>
          {s.monObjectif > 0 ? (
            <div className="mt-3">
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="font-medium text-foreground">
                  Objectif {s.objectifLabel} : {compact(s.monCaMois)} / {compact(s.monObjectif)}
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
      ) : null}

      {/* L'essentiel */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Leads reçus" value={String(s.recus)} />
        <Kpi
          label="Pipeline en cours"
          value={compact(s.pipeline)}
          sub={`${s.enCours.length} actif${s.enCours.length > 1 ? "s" : ""}`}
          color="text-blue-700"
        />
        <Kpi
          label="CA signé (HT)"
          value={compact(s.ca)}
          color="text-green-700"
          sub={`${s.signes.length} signature${s.signes.length > 1 ? "s" : ""} · par date de signature`}
        />
        <Kpi
          label="Taux de closing"
          value={`${s.closing} %`}
          sub={`${s.won.length} signé${s.won.length > 1 ? "s" : ""} · ${s.perdu.length} perdu${s.perdu.length > 1 ? "s" : ""} (leads reçus)`}
        />
      </div>

      {/* À traiter — les alertes qui appellent une action */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Leads non attribués"
          value={String(s.nonAssignes)}
          sub="à répartir"
          color={s.nonAssignes > 0 ? "text-amber-600" : undefined}
          href="/liste"
        />
        <Kpi
          label="Jamais contactés"
          value={String(s.aContacter)}
          sub="en cours, sans 1er contact"
          color={s.aContacter > 0 ? "text-amber-600" : undefined}
          href="/kanban"
        />
        <Kpi
          label="À relancer (7 j)"
          value={String(s.aRelancer)}
          color={s.aRelancer > 0 ? "text-orange-600" : undefined}
          href="/emploi-du-temps"
        />
        <Kpi
          label="RDV à venir"
          value={String(s.rdvAVenir)}
          sub={
            s.rdvAReprogrammer > 0
              ? `${s.rdvAReprogrammer} à reprogrammer`
              : undefined
          }
          href="/emploi-du-temps"
        />
      </div>

      {/* Portes d'entrée vers l'analyse détaillée */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Lien
          href={`/commercial${qs}`}
          Icon={Target}
          titre="Commercial"
          sous="Entonnoir, sources, carte de France, volumes par jour et par mois"
        />
        {s.admin ? (
          <Lien
            href={`/comptabilite${qs}`}
            Icon={Euro}
            titre="Comptabilité"
            sous="CA, marge, encaissements, performance par ADV, objectifs"
          />
        ) : null}
      </div>
    </main>
  );
}

function Lien({
  href,
  Icon,
  titre,
  sous,
}: {
  href: string;
  Icon: typeof LineChart;
  titre: string;
  sous: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-border bg-white p-4 transition-colors hover:border-primary/50 hover:bg-primary/[0.03]"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-eyebrow block text-foreground">{titre}</span>
        <span className="block text-xs text-muted-foreground">{sous}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
