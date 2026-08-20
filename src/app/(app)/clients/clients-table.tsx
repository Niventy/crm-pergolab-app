"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Minus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatEuros, formatDate } from "@/lib/format";
import { updateLeadStage } from "@/app/(app)/kanban/actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type StageOption = { id: string; nom: string; couleur: string };

export type CommandeRow = {
  id: string;
  dateCde: string; // "YYYY-MM-DD"
  commercial: string | null;
  assignedTo: string | null;
  equipePose: string | null;
  nom: string;
  codePostal: string | null;
  ville: string | null;
  produit: string | null;
  montantHt: number | null;
  montantTtc: number | null;
  acompteEncaisse: number | null;
  paiementEspece: number | null;
  montantAchat: number | null; // admin only
  financeur: string | null;
  modePaiement: string | null;
  factureSoldeClient: boolean;
  factureSoldePoseur: boolean;
  dossierDateEnvoi: string | null;
  datePoseReelle: string | null;
  stageId: string | null;
  stageNom: string | null;
  stageCouleur: string | null;
};

const MOIS_FR = [
  "JANVIER", "FÉVRIER", "MARS", "AVRIL", "MAI", "JUIN",
  "JUILLET", "AOÛT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DÉCEMBRE",
];
const ym = (d: string) => d.slice(0, 7);
const moisLabel = (key: string) => {
  const [y, m] = key.split("-");
  return `${MOIS_FR[Number(m) - 1]} ${y}`;
};
const semaine = (d: string) => `S${Math.min(5, Math.ceil(Number(d.slice(8, 10)) / 7))}`;

// Base à encaisser = TTC si connu, sinon HT.
const baseDue = (r: CommandeRow) => r.montantTtc ?? r.montantHt ?? 0;
const encaisse = (r: CommandeRow) =>
  (r.acompteEncaisse ?? 0) + (r.paiementEspece ?? 0);
const reste = (r: CommandeRow) => Math.max(0, baseDue(r) - encaisse(r));

export function CommandesTable({
  rows,
  admin,
  currentUserId,
  stages,
}: {
  rows: CommandeRow[];
  admin: boolean;
  currentUserId: string | null;
  stages: StageOption[];
}) {
  const router = useRouter();
  const [annee, setAnnee] = useState("all");
  const [commercial, setCommercial] = useState("all");
  const [equipe, setEquipe] = useState("all");

  // Options de filtres.
  const commMap = new Map<string, string>();
  for (const r of rows) if (r.assignedTo && r.commercial) commMap.set(r.assignedTo, r.commercial);
  const commercialOptions = [
    { value: "all", label: "Tous les commerciaux" },
    ...[...commMap.entries()]
      .map(([id, nom]) => ({
        value: id,
        label: id === currentUserId ? `${nom} (moi)` : nom,
        me: id === currentUserId,
      }))
      .sort((a, b) => (a.me ? -1 : b.me ? 1 : a.label.localeCompare(b.label))),
  ];

  const equipeSet = [...new Set(rows.map((r) => r.equipePose).filter(Boolean) as string[])].sort();
  const equipeOptions = [
    { value: "all", label: "Toutes les équipes de pose" },
    ...equipeSet.map((e) => ({ value: e, label: e })),
  ];

  const anneeSet = [...new Set(rows.map((r) => r.dateCde.slice(0, 4)))].sort().reverse();
  const anneeOptions = [
    { value: "all", label: "Toutes les années" },
    ...anneeSet.map((a) => ({ value: a, label: a })),
  ];

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (annee !== "all" && r.dateCde.slice(0, 4) !== annee) return false;
        if (commercial !== "all" && r.assignedTo !== commercial) return false;
        if (equipe !== "all" && r.equipePose !== equipe) return false;
        return true;
      }),
    [rows, annee, commercial, equipe],
  );

  // KPIs réactifs.
  const kHt = filtered.reduce((a, r) => a + (r.montantHt ?? 0), 0);
  const kEncaisse = filtered.reduce((a, r) => a + encaisse(r), 0);
  const kReste = filtered.reduce((a, r) => a + reste(r), 0);
  const kMarge = filtered.reduce(
    (a, r) => a + (r.montantHt != null && r.montantAchat != null ? r.montantHt - r.montantAchat : 0),
    0,
  );

  // Regroupement par mois (desc), avec totaux mensuels.
  const groupes = useMemo(() => {
    const map = new Map<string, CommandeRow[]>();
    for (const r of filtered) {
      const k = ym(r.dateCde);
      (map.get(k) ?? map.set(k, []).get(k)!).push(r);
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([mois, list]) => ({
        mois,
        list: [...list].sort((a, b) => b.dateCde.localeCompare(a.dateCde)),
        totHt: list.reduce((a, r) => a + (r.montantHt ?? 0), 0),
        totTtc: list.reduce((a, r) => a + (r.montantTtc ?? 0), 0),
        totEnc: list.reduce((a, r) => a + encaisse(r), 0),
        totReste: list.reduce((a, r) => a + reste(r), 0),
      }));
  }, [filtered]);

  const actifs = annee !== "all" || commercial !== "all" || equipe !== "all";
  const reset = () => {
    setAnnee("all");
    setCommercial("all");
    setEquipe("all");
  };

  const NB_COLS = 11;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 px-6 pb-3 sm:grid-cols-4 lg:grid-cols-5">
        <Kpi label="Commandes" value={String(filtered.length)} />
        <Kpi label="CA HT" value={formatEuros(kHt)} />
        <Kpi label="Encaissé" value={formatEuros(kEncaisse)} accent="green" />
        <Kpi label="Reste à encaisser" value={formatEuros(kReste)} accent="orange" />
        {admin ? <Kpi label="Marge" value={formatEuros(kMarge)} accent="green" /> : null}
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2 px-6 pb-3">
        <FilterSelect options={anneeOptions} value={annee} onChange={setAnnee} width="w-40" />
        <FilterSelect options={commercialOptions} value={commercial} onChange={setCommercial} width="w-52" />
        <FilterSelect options={equipeOptions} value={equipe} onChange={setEquipe} width="w-56" />
        {actifs ? (
          <button
            type="button"
            onClick={reset}
            className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Réinitialiser
          </button>
        ) : null}
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} commande{filtered.length > 1 ? "s" : ""}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="px-6 py-16 text-center text-sm text-muted-foreground">
          Aucune commande dans cette vue. Une commande apparaît dès qu&apos;une fiche
          passe « Gagnée ».
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col px-6 pb-6">
          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border">
            <table className="min-w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-muted">
                  {[
                    { l: "Sem." },
                    { l: "Date" },
                    { l: "Client" },
                    { l: "Statut" },
                    { l: "Localisation" },
                    { l: "Produit" },
                    { l: "HT", r: true },
                    { l: "TTC", r: true },
                    { l: "Encaissé", r: true },
                    { l: "Reste", r: true },
                    { l: "Dossier" },
                  ].map((c) => (
                    <th
                      key={c.l}
                      className={cn(
                        "border-b border-r border-border px-3 py-2 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap last:border-r-0",
                        c.r ? "text-right" : "text-left",
                      )}
                    >
                      {c.l}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupes.map((g) => (
                  <MonthGroup
                    key={g.mois}
                    g={g}
                    nbCols={NB_COLS}
                    router={router}
                    stages={stages}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function MonthGroup({
  g,
  nbCols,
  router,
  stages,
}: {
  g: {
    mois: string;
    list: CommandeRow[];
    totHt: number;
    totTtc: number;
    totEnc: number;
    totReste: number;
  };
  nbCols: number;
  router: ReturnType<typeof useRouter>;
  stages: StageOption[];
}) {
  return (
    <>
      <tr className="bg-primary/[0.06]">
        <td
          colSpan={nbCols}
          className="border-b border-border px-3 py-1.5 text-[0.7rem] font-bold uppercase tracking-wide text-primary"
        >
          {moisLabel(g.mois)} · {g.list.length} commande{g.list.length > 1 ? "s" : ""}
        </td>
      </tr>
      {g.list.map((r) => (
        <tr
          key={r.id}
          onClick={() => router.push(`/leads/${r.id}`)}
          className="cursor-pointer bg-white transition-colors hover:bg-primary/[0.06]"
        >
          <Td className="text-muted-foreground">{semaine(r.dateCde)}</Td>
          <Td className="whitespace-nowrap tabular-nums">{formatDate(r.dateCde)}</Td>
          <Td className="font-medium text-foreground">{r.nom}</Td>
          <Td className="whitespace-nowrap">
            <StatutSelect
              leadId={r.id}
              stageId={r.stageId}
              couleur={r.stageCouleur}
              stages={stages}
              onDone={() => router.refresh()}
            />
          </Td>
          <Td className="whitespace-nowrap text-muted-foreground">
            {[r.codePostal, r.ville].filter(Boolean).join(" ") || "—"}
          </Td>
          <Td className="max-w-[16rem] truncate" title={r.produit ?? undefined}>
            {r.produit ?? "—"}
          </Td>
          <Td className="text-right tabular-nums">{formatEuros(r.montantHt)}</Td>
          <Td className="text-right tabular-nums">{formatEuros(r.montantTtc)}</Td>
          <Td className="text-right tabular-nums text-green-700">
            {encaisse(r) > 0 ? formatEuros(encaisse(r)) : "—"}
          </Td>
          <Td className="text-right tabular-nums text-orange-700">
            {reste(r) > 0 ? formatEuros(reste(r)) : "—"}
          </Td>
          <Td>
            <div className="flex items-center gap-1.5" title="Facture client · Facture poseur · Envoi dossier">
              <Flag on={r.factureSoldeClient} label="C" />
              <Flag on={r.factureSoldePoseur} label="P" />
              <span className="text-[0.7rem] text-muted-foreground">
                {r.dossierDateEnvoi ? formatDate(r.dossierDateEnvoi) : "—"}
              </span>
            </div>
          </Td>
        </tr>
      ))}
      {/* Total du mois */}
      <tr className="bg-muted/60 font-semibold">
        <Td className="text-[0.7rem] uppercase tracking-wide text-muted-foreground" colSpan={6}>
          Total {moisLabel(g.mois)}
        </Td>
        <Td className="text-right tabular-nums">{formatEuros(g.totHt)}</Td>
        <Td className="text-right tabular-nums">{formatEuros(g.totTtc)}</Td>
        <Td className="text-right tabular-nums text-green-700">{formatEuros(g.totEnc)}</Td>
        <Td className="text-right tabular-nums text-orange-700">{formatEuros(g.totReste)}</Td>
        <Td />
      </tr>
    </>
  );
}

// Statut modifiable sur place : change l'étape du dossier client.
function StatutSelect({
  leadId,
  stageId,
  couleur,
  stages,
  onDone,
}: {
  leadId: string;
  stageId: string | null;
  couleur: string | null;
  stages: StageOption[];
  onDone: () => void;
}) {
  const [pending, start] = useTransition();

  function onChange(newId: string) {
    if (!newId || newId === stageId) return;
    start(async () => {
      const r = await updateLeadStage(leadId, newId);
      if (r?.error) toast.error("Changement impossible", { description: r.error });
      else {
        toast.success("Statut mis à jour");
        onDone();
      }
    });
  }

  return (
    <span
      className="inline-flex items-center gap-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: couleur ?? "#94a3b8" }}
      />
      <select
        value={stageId ?? ""}
        disabled={pending}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 max-w-[9rem] cursor-pointer rounded-md border border-transparent bg-transparent px-1 text-sm outline-none hover:border-border focus:border-primary disabled:opacity-50"
      >
        {stageId && !stages.some((s) => s.id === stageId) ? (
          <option value={stageId}>— hors chantier —</option>
        ) : null}
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nom}
          </option>
        ))}
      </select>
    </span>
  );
}

function Flag({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-4 items-center justify-center rounded text-[9px] font-bold",
        on ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-400",
      )}
      title={label === "C" ? "Facture solde client" : "Facture solde poseur"}
    >
      {on ? <Check className="size-3" /> : <Minus className="size-3" />}
    </span>
  );
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "green" | "orange";
}) {
  return (
    <div className="rounded-xl border border-border bg-white px-3 py-2">
      <div className="text-eyebrow text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-lg font-bold tabular-nums",
          accent === "green"
            ? "text-green-700"
            : accent === "orange"
              ? "text-orange-700"
              : "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function FilterSelect({
  options,
  value,
  onChange,
  width,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  width: string;
}) {
  return (
    <Select items={options} value={value} onValueChange={(v) => onChange(v ?? "all")}>
      <SelectTrigger className={cn("h-8", width)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Td({
  children,
  className,
  colSpan,
  title,
}: {
  children?: React.ReactNode;
  className?: string;
  colSpan?: number;
  title?: string;
}) {
  return (
    <td
      colSpan={colSpan}
      title={title}
      className={cn(
        "border-b border-r border-border px-3 py-2 align-middle last:border-r-0",
        className,
      )}
    >
      {children}
    </td>
  );
}
