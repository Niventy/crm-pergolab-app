import Link from "next/link";
import { LineChart } from "lucide-react";
import { db } from "@/db";
import { cn } from "@/lib/utils";
import { formatEuros } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { BarParMois } from "./dashboard-charts";
import { PeriodSelect } from "./period-select";

export const dynamic = "force-dynamic";

const MOIS = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
];

const num = (v: string | null) => Number(v ?? 0);

function compact(n: number): string {
  return n >= 10000
    ? `${(n / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k€`
    : formatEuros(n);
}

// "YYYY-MM" d'un horodatage de réception.
function ym(d: Date | string): string {
  return (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 7);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ adv?: string; mois?: string }>;
}) {
  const [sp, supabase, allLeads] = await Promise.all([
    searchParams,
    createClient(),
    db.query.leads.findMany({ with: { stage: true, responsable: true } }),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-11

  // --- Filtre périmètre (responsable) ---
  const scopeSel = sp.adv ?? "all";
  const scoped =
    scopeSel === "all"
      ? allLeads
      : scopeSel === "none"
        ? allLeads.filter((l) => !l.assignedTo)
        : allLeads.filter((l) => l.assignedTo === scopeSel);

  const respMap = new Map<string, string>();
  for (const l of allLeads) {
    if (l.assignedTo && l.responsable)
      respMap.set(l.assignedTo, l.responsable.nom ?? l.responsable.email);
  }
  const scopes = [
    { value: "all", label: "Toute l'équipe" },
    ...[...respMap.entries()].map(([id, nom]) => ({
      value: id,
      label: id === user?.id ? `${nom} (moi)` : nom,
    })),
  ];

  // --- Filtre période (date de RÉCEPTION du lead = created_at) ---
  const moisSel = sp.mois && /^\d{4}-\d{2}$/.test(sp.mois) ? sp.mois : "annee";
  const periodeLabel =
    moisSel === "annee"
      ? `Année ${year}`
      : `${MOIS[Number(moisSel.slice(5)) - 1]} ${year}`;
  const moisActif = moisSel === "annee" ? null : Number(moisSel.slice(5)) - 1;

  const inPeriode = (l: (typeof scoped)[number]) =>
    moisSel === "annee"
      ? ym(l.createdAt).startsWith(String(year))
      : ym(l.createdAt) === moisSel;

  // Cohorte = leads REÇUS sur la période (et le périmètre).
  const leads = scoped.filter(inPeriode);

  const periodOptions = [
    { value: "annee", label: `Année ${year}` },
    ...Array.from({ length: month + 1 }, (_, m) => ({
      value: `${year}-${String(m + 1).padStart(2, "0")}`,
      label: `${MOIS[m]} ${year}`,
    })),
  ];

  // --- KPI sur la cohorte ---
  const sum = (arr: typeof leads, f: (l: (typeof leads)[number]) => number) =>
    arr.reduce((a, l) => a + f(l), 0);

  const won = leads.filter((l) => l.statut === "gagnee");
  const perdu = leads.filter((l) => l.statut === "perdue");
  const enCours = leads.filter((l) => l.statut === "en_cours");

  const ca = sum(won, (l) => num(l.montant));
  const marge = sum(won, (l) => num(l.montant) - num(l.montantAchat));
  const margePct = ca ? Math.round((marge / ca) * 100) : 0;
  const acomptes = sum(won, (l) => num(l.acompte));
  const pipeline = sum(enCours, (l) => num(l.montant));
  const devisEnAttente = enCours.filter((l) => l.stage?.nom === "Devis envoyé");
  const devisMontant = sum(devisEnAttente, (l) => num(l.montant));
  const closing =
    won.length + perdu.length > 0
      ? Math.round((won.length / (won.length + perdu.length)) * 100)
      : 0;
  const panierMoyen = won.length ? ca / won.length : 0;

  const today = now.toISOString().slice(0, 10);
  const in7 = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const rdvAVenir = leads.filter(
    (l) => l.rdvDate && l.rdvDate >= today && l.rdvStatut !== "honore",
  ).length;
  const aRelancer = enCours.filter(
    (l) => l.nextRelanceDate && l.nextRelanceDate <= in7,
  ).length;

  // Leads reçus par mois (sur le périmètre, toute l'année) → graphe.
  const serie = Array.from({ length: month + 1 }, (_, m) => {
    const key = `${year}-${String(m + 1).padStart(2, "0")}`;
    return {
      mois: MOIS[m],
      valeur: scoped.filter((l) => ym(l.createdAt) === key).length,
    };
  });

  // Entonnoir (cohorte).
  const recus = leads.length;
  const funnel = [
    { label: "Leads reçus", v: recus },
    { label: "Contactés", v: leads.filter((l) => l.datePremierContact).length },
    { label: "RDV", v: leads.filter((l) => l.rdvDate).length },
    { label: "Devis envoyés", v: leads.filter((l) => (l.stage?.cycle ?? 1) >= 2).length },
    { label: "Signés", v: won.length },
  ];

  // Sources (cohorte).
  const srcMap = new Map<string, number>();
  for (const l of leads) {
    const s = l.source ?? "Autre";
    srcMap.set(s, (srcMap.get(s) ?? 0) + 1);
  }
  const sources = [...srcMap.entries()]
    .map(([label, v]) => ({ label, v }))
    .sort((a, b) => b.v - a.v);
  const srcMax = Math.max(1, ...sources.map((s) => s.v));

  // Perf par ADV (cohorte).
  const advMap = new Map<
    string,
    { nom: string; leads: number; ca: number; won: number; perdu: number }
  >();
  for (const l of leads) {
    const nom = l.responsable?.nom ?? l.responsable?.email ?? "Non assigné";
    const a = advMap.get(nom) ?? { nom, leads: 0, ca: 0, won: 0, perdu: 0 };
    a.leads += 1;
    if (l.statut === "gagnee") {
      a.won += 1;
      a.ca += num(l.montant);
    }
    if (l.statut === "perdue") a.perdu += 1;
    advMap.set(nom, a);
  }
  const advs = [...advMap.values()].sort((a, b) => b.ca - a.ca);

  const advHref = (advValue: string) => {
    const p = new URLSearchParams();
    if (advValue !== "all") p.set("adv", advValue);
    if (moisSel !== "annee") p.set("mois", moisSel);
    const qs = p.toString();
    return qs ? `/dashboard?${qs}` : "/dashboard";
  };

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-6 py-6 pb-28">
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand text-brand-foreground">
            <LineChart className="size-5" />
          </span>
          <div>
            <h1 className="text-display text-2xl">Indicateurs clés</h1>
            <p className="text-sm text-muted-foreground">
              Leads reçus · {periodeLabel}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PeriodSelect value={moisSel} options={periodOptions} />
          <div className="inline-flex flex-wrap rounded-lg border border-border bg-muted/50 p-0.5">
            {scopes.map((s) => {
              const active = scopeSel === s.value;
              return (
                <Link
                  key={s.value}
                  href={advHref(s.value)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* KPI cohorte */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Leads reçus" value={String(recus)} />
        <Kpi label="CA généré (HT)" value={compact(ca)} color="text-green-700" />
        <Kpi
          label="Marge générée"
          value={compact(marge)}
          sub={`${margePct} % du CA`}
          color="text-green-700"
        />
        <Kpi label="Taux de closing" value={`${closing} %`} sub="signés / (signés + perdus)" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Pipeline en cours"
          value={compact(pipeline)}
          sub={`${enCours.length} actif${enCours.length > 1 ? "s" : ""}`}
          color="text-blue-700"
        />
        <Kpi
          label="Devis en attente"
          value={compact(devisMontant)}
          sub={`${devisEnAttente.length} devis envoyé${devisEnAttente.length > 1 ? "s" : ""}`}
          color="text-blue-700"
        />
        <Kpi label="Acomptes encaissés" value={compact(acomptes)} color="text-green-700" />
        <Kpi label="RDV à venir" value={String(rdvAVenir)} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Panier moyen signé" value={compact(panierMoyen)} />
        <Kpi
          label="Prospects à relancer (7 j)"
          value={String(aRelancer)}
          color={aRelancer > 0 ? "text-orange-600" : undefined}
        />
      </div>

      {/* Graphes */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title={`Leads reçus par mois — ${year}`} className="lg:col-span-2">
          <BarParMois data={serie} moisActif={moisActif} unite="nombre" libelle="Leads reçus" />
        </Panel>

        <Panel title={`Entonnoir — ${periodeLabel}`}>
          <ul className="space-y-2">
            {funnel.map((f) => {
              const pct = recus ? Math.round((f.v / recus) * 100) : 0;
              return (
                <li key={f.label}>
                  <div className="mb-0.5 flex justify-between text-xs">
                    <span className="text-foreground">{f.label}</span>
                    <span className="text-muted-foreground">
                      {f.v} · {pct} %
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Leads par source">
          {sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun lead sur la période.</p>
          ) : (
            <ul className="space-y-2">
              {sources.map((s) => (
                <li key={s.label} className="flex items-center gap-3 text-sm">
                  <span className="w-40 shrink-0 truncate text-foreground">{s.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${(s.v / srcMax) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-muted-foreground">{s.v}</span>
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
                <th className="pb-2 text-right font-semibold">Leads</th>
                <th className="pb-2 text-right font-semibold">CA</th>
                <th className="pb-2 text-right font-semibold">Closing</th>
              </tr>
            </thead>
            <tbody>
              {advs.map((a) => {
                const cl =
                  a.won + a.perdu > 0 ? Math.round((a.won / (a.won + a.perdu)) * 100) : 0;
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
    </main>
  );
}

function Kpi({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", color ?? "text-foreground")}>
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function Panel({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-white p-4", className)}>
      <h2 className="text-eyebrow mb-3 text-muted-foreground">{title}</h2>
      {children}
    </div>
  );
}
