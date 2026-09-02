// Briques d'UI partagées par Dashboard / Commercial / Comptabilité.
import Link from "next/link";
import { LineChart } from "lucide-react";
import { cn } from "@/lib/utils";
import { PeriodSelect } from "./period-select";

export function Kpi({
  label,
  value,
  sub,
  color,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  href?: string;
}) {
  const contenu = (
    <>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          color ?? "text-foreground",
        )}
      >
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div> : null}
    </>
  );
  const classe =
    "rounded-xl border border-border bg-white p-4" +
    (href ? " transition-colors hover:border-primary/50 hover:bg-primary/[0.03]" : "");
  return href ? (
    <Link href={href} className={`block ${classe}`}>
      {contenu}
    </Link>
  ) : (
    <div className={classe}>{contenu}</div>
  );
}

export function Panel({
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

// En-tête commun : titre + sélecteur de période + périmètre (ADV).
export function EnTete({
  titre,
  sous,
  Icon,
  basePath,
  moisSel,
  periodOptions,
  scopeSel,
  scopes,
}: {
  titre: string;
  sous: string;
  Icon: typeof LineChart;
  basePath: string;
  moisSel: string;
  periodOptions: { value: string; label: string }[];
  scopeSel: string;
  scopes: { value: string; label: string }[];
}) {
  const href = (advValue: string) => {
    const p = new URLSearchParams();
    if (advValue !== "all") p.set("adv", advValue);
    if (moisSel !== "annee") p.set("mois", moisSel);
    const qs = p.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-brand text-brand-foreground">
          <Icon className="size-5" />
        </span>
        <div>
          <h1 className="text-display text-2xl">{titre}</h1>
          <p className="text-sm text-muted-foreground">{sous}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <PeriodSelect value={moisSel} options={periodOptions} basePath={basePath} />
        {scopes.length > 0 ? (
          <div className="inline-flex flex-wrap rounded-lg border border-border bg-muted/50 p-0.5">
            {scopes.map((s) => (
              <Link
                key={s.value}
                href={href(s.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                  scopeSel === s.value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
