"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Minus, Ban } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatEuros, formatDate, moisLabelFr } from "@/lib/format";
import { updateLeadStage } from "@/app/(app)/kanban/actions";
import { FilterSelect, Td } from "@/components/data-table";
import { PHASE_META, PHASE_ORDER, type CommandeRow, type Phase, type StageOption } from "./phases-meta";

const ym = (d: string) => d.slice(0, 7);
const moisLabel = (key: string) => moisLabelFr(key);
const semaine = (d: string) => `S${Math.min(5, Math.ceil(Number(d.slice(8, 10)) / 7))}`;

// Base à encaisser = TTC uniquement (jamais le HT : le client paie la TVA).
// TTC inconnu → reste inconnu (null), affiché « TTC ? » plutôt qu'un faux chiffre.
const encaisse = (r: CommandeRow) =>
  (r.acompteEncaisse ?? 0) + (r.paiementEspece ?? 0);
const reste = (r: CommandeRow): number | null =>
  r.montantTtc == null ? null : Math.max(0, r.montantTtc - encaisse(r));

export function CommandesTable({
  rows,
  admin,
  currentUserId,
  stages,
  initialEnc = "all",
}: {
  rows: CommandeRow[];
  admin: boolean;
  currentUserId: string | null;
  stages: StageOption[];
  /** Filtre d'encaissement pré-appliqué (?enc=…). */
  initialEnc?: Phase | "all";
}) {
  const router = useRouter();
  const [annee, setAnnee] = useState("all");
  const [commercial, setCommercial] = useState("all");
  const [equipe, setEquipe] = useState("all");
  const [enc, setEnc] = useState<Phase | "all">(initialEnc);
  const [avecAnnulees, setAvecAnnulees] = useState(false);

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

  const encOptions = [
    { value: "all", label: "Tout encaissement" },
    ...PHASE_ORDER.map((p) => ({ value: p, label: PHASE_META[p].label })),
  ];

  const nbAnnulees = rows.filter((r) => r.statut !== "gagnee").length;

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (!avecAnnulees && r.statut !== "gagnee") return false;
        if (annee !== "all" && r.dateCde.slice(0, 4) !== annee) return false;
        if (commercial !== "all" && r.assignedTo !== commercial) return false;
        if (equipe !== "all" && r.equipePose !== equipe) return false;
        if (enc !== "all" && (r.statut !== "gagnee" || r.phase !== enc)) return false;
        return true;
      }),
    [rows, annee, commercial, equipe, enc, avecAnnulees],
  );

  // KPIs réactifs (commandes actives uniquement).
  const actives = filtered.filter((r) => r.statut === "gagnee");
  const kHt = actives.reduce((a, r) => a + (r.montantHt ?? 0), 0);
  const kEncaisse = actives.reduce((a, r) => a + encaisse(r), 0);
  const kReste = actives.reduce((a, r) => a + (reste(r) ?? 0), 0);
  const kSansTtc = actives.filter((r) => r.montantTtc == null).length;
  const kMarge = actives.reduce(
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
      .map(([mois, list]) => {
        const act = list.filter((r) => r.statut === "gagnee");
        return {
          mois,
          list: [...list].sort((a, b) => b.dateCde.localeCompare(a.dateCde)),
          totHt: act.reduce((a, r) => a + (r.montantHt ?? 0), 0),
          totTtc: act.reduce((a, r) => a + (r.montantTtc ?? 0), 0),
          totEnc: act.reduce((a, r) => a + encaisse(r), 0),
          totReste: act.reduce((a, r) => a + (reste(r) ?? 0), 0),
        };
      });
  }, [filtered]);

  const actifs =
    annee !== "all" || commercial !== "all" || equipe !== "all" || enc !== "all" || avecAnnulees;
  const reset = () => {
    setAnnee("all");
    setCommercial("all");
    setEquipe("all");
    setEnc("all");
    setAvecAnnulees(false);
  };

  const NB_COLS = 12;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 px-6 pb-3 sm:grid-cols-4 lg:grid-cols-5">
        <Kpi label="Commandes" value={String(actives.length)} />
        <Kpi label="CA HT" value={formatEuros(kHt)} />
        <Kpi label="Encaissé" value={formatEuros(kEncaisse)} accent="green" />
        <Kpi
          label="Reste à encaisser"
          value={formatEuros(kReste)}
          accent="orange"
          sub={kSansTtc > 0 ? `${kSansTtc} commande${kSansTtc > 1 ? "s" : ""} sans TTC` : undefined}
        />
        {admin ? <Kpi label="Marge" value={formatEuros(kMarge)} accent="green" /> : null}
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2 px-6 pb-3">
        <FilterSelect options={encOptions} value={enc} onChange={(v) => setEnc(v as Phase | "all")} width="w-44" />
        <FilterSelect options={anneeOptions} value={annee} onChange={setAnnee} width="w-40" />
        <FilterSelect options={commercialOptions} value={commercial} onChange={setCommercial} width="w-52" />
        <FilterSelect options={equipeOptions} value={equipe} onChange={setEquipe} width="w-56" />
        {nbAnnulees > 0 ? (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={avecAnnulees}
              onChange={(e) => setAvecAnnulees(e.target.checked)}
              className="size-3.5 accent-red-600"
            />
            Annulées ({nbAnnulees})
          </label>
        ) : null}
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
          passe « Signée ».
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col px-6 pb-24">
          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border">
            <table className="min-w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-muted">
                  {[
                    { l: "Sem." },
                    { l: "Date" },
                    { l: "Client" },
                    { l: "Étape" },
                    { l: "Encaissement" },
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
      {g.list.map((r) => {
        const annulee = r.statut !== "gagnee";
        const rst = reste(r);
        return (
          <tr
            key={r.id}
            onClick={() => router.push(`/leads/${r.id}`)}
            className={cn(
              "cursor-pointer bg-white transition-colors hover:bg-primary/[0.06]",
              annulee && "text-muted-foreground",
            )}
          >
            <Td className="text-muted-foreground">{semaine(r.dateCde)}</Td>
            <Td className="whitespace-nowrap tabular-nums">{formatDate(r.dateCde)}</Td>
            <Td className={cn("font-medium text-foreground", annulee && "line-through")}>{r.nom}</Td>
            <Td className="whitespace-nowrap">
              <StatutSelect
                leadId={r.id}
                stageId={r.stageId}
                couleur={r.stageCouleur}
                stages={stages}
                onDone={() => router.refresh()}
              />
            </Td>
            <Td className="whitespace-nowrap">
              {annulee ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  <Ban className="size-3" /> Annulée
                </span>
              ) : (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                    PHASE_META[r.phase].cls,
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", PHASE_META[r.phase].dot)} />
                  {PHASE_META[r.phase].label}
                </span>
              )}
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
              {annulee ? (
                "—"
              ) : rst == null ? (
                <span
                  className="text-xs text-amber-700"
                  title="TTC inconnu : marque le devis signé ou saisis le TTC sur la fiche"
                >
                  TTC ?
                </span>
              ) : rst > 0 ? (
                formatEuros(rst)
              ) : (
                "—"
              )}
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
        );
      })}
      {/* Total du mois (commandes actives) */}
      <tr className="bg-muted/60 font-semibold">
        <Td className="text-[0.7rem] uppercase tracking-wide text-muted-foreground" colSpan={7}>
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

// Étape de chantier modifiable sur place (« Annulée » passe par la fiche ou le
// Kanban, qui demandent un motif).
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
  const choix = stages.filter((s) => !s.isPerdue || s.id === stageId);

  function onChange(newId: string) {
    if (!newId || newId === stageId) return;
    start(async () => {
      const r = await updateLeadStage(leadId, newId);
      if (r?.error) toast.error("Changement impossible", { description: r.error });
      else {
        toast.success("Étape mise à jour");
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
        {choix.map((s) => (
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
  sub,
}: {
  label: string;
  value: string;
  accent?: "green" | "orange";
  sub?: string;
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
      {sub ? <div className="text-[11px] text-amber-700">{sub}</div> : null}
    </div>
  );
}

