"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Trash2, CheckSquare, RotateCcw, Archive } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FilterSelect, Td } from "@/components/data-table";
import { deleteLeads, restoreLeads, purgeLeads } from "./actions";
import {
  formatEuros,
  formatHorodatage,
  formatDateCourte,
  tempsRelatif,
  humanise,
  ymParis,
  moisLabelFr,
} from "@/lib/format";
import type { Lead, Stage, Profile } from "@/db/schema";

type Row = Lead & {
  stage: Stage | null;
  responsable: Profile | null;
};

// Mois de réception en heure de Paris (pas UTC) ; libellé partagé.
const ymOf = ymParis;
const moisLabel = (key: string) => moisLabelFr(key);

const STATUT: Record<string, { label: string; cls: string }> = {
  en_cours: { label: "En cours", cls: "bg-slate-200 text-slate-700" },
  gagnee: { label: "Gagnée", cls: "bg-green-600 text-white" },
  perdue: { label: "Perdue", cls: "bg-red-600 text-white" },
};

// En-têtes de colonnes (libellé + alignement éventuel).
const COLS = [
  "Nom",
  "Reçu",
  "Responsable",
  "Étape",
  "Statut",
  "Dimensions",
  "Code postal",
  "Appel souhaité",
  "Installation",
  "Montant",
  "RDV",
  "Relances",
];

// « 3 j » → « il y a 3 j » (mais pas pour « à l'instant » ni une date courte).
function recuIlYA(value: Date | string): string {
  const rel = tempsRelatif(value);
  return /(min|h|j)$/.test(rel) ? `il y a ${rel}` : rel;
}

const FILTERS = [
  { id: 0, label: "Tous" },
  { id: 1, label: "Prospection" },
  { id: 2, label: "Devis & closing" },
  { id: 3, label: "Pose & technique" },
];

// Confirmation en attente : quoi (corbeille / restaurer / purger) et sur qui.
type Confirm =
  | { kind: "corbeille" | "restaurer" | "purger"; ids: string[]; nom?: string }
  | null;

export function ListeTable({
  leads,
  corbeille = [],
  stages,
  currentUserId,
  admin = false,
}: {
  leads: Row[];
  /** Fiches supprimées (soft delete), admin uniquement. */
  corbeille?: Row[];
  stages: Stage[];
  currentUserId?: string | null;
  admin?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  // Filtres dans l'URL (comme le Kanban et le Dashboard) : ils survivent à la
  // navigation vers une fiche et au retour, et se partagent par lien.
  const [filter, setFilter] = useState(() => {
    const c = Number(sp.get("cycle") ?? 0);
    return [0, 1, 2, 3].includes(c) ? c : 0;
  }); // cycle
  const [etape, setEtape] = useState(sp.get("etape") ?? "all");
  const [resp, setResp] = useState(sp.get("resp") ?? "all");
  const [mois, setMois] = useState(sp.get("mois") ?? "all");
  const [dept, setDept] = useState(sp.get("dept") ?? "all");
  useEffect(() => {
    const p = new URLSearchParams();
    if (filter !== 0) p.set("cycle", String(filter));
    if (etape !== "all") p.set("etape", etape);
    if (resp !== "all") p.set("resp", resp);
    if (mois !== "all") p.set("mois", mois);
    if (dept !== "all") p.set("dept", dept);
    const qs = p.toString();
    const cible = qs ? `${pathname}?${qs}` : pathname;
    if (cible !== `${pathname}${sp.toString() ? `?${sp.toString()}` : ""}`)
      router.replace(cible, { scroll: false });
  }, [filter, etape, resp, mois, dept, pathname, router, sp]);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [vueCorbeille, setVueCorbeille] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [pending, start] = useTransition();

  // Source affichée : liste active ou corbeille (admin).
  const source = vueCorbeille ? corbeille : leads;

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }

  function basculerCorbeille() {
    setVueCorbeille((v) => !v);
    exitSelect();
  }

  // Exécute l'action confirmée (corbeille / restauration / purge).
  function executer() {
    if (!confirm) return;
    const { kind, ids } = confirm;
    start(async () => {
      const r =
        kind === "corbeille"
          ? await deleteLeads(ids)
          : kind === "restaurer"
            ? await restoreLeads(ids)
            : await purgeLeads(ids);
      if (!r.ok) {
        toast.error(r.error ?? "Échec");
      } else {
        const n = ids.length;
        toast.success(
          kind === "corbeille"
            ? `${n} fiche${n > 1 ? "s" : ""} mise${n > 1 ? "s" : ""} à la corbeille`
            : kind === "restaurer"
              ? `${n} fiche${n > 1 ? "s" : ""} restaurée${n > 1 ? "s" : ""}`
              : `${n} fiche${n > 1 ? "s" : ""} supprimée${n > 1 ? "s" : ""} définitivement`,
        );
        exitSelect();
        router.refresh();
      }
      setConfirm(null);
    });
  }

  const CONFIRM_TEXTS: Record<
    NonNullable<Confirm>["kind"],
    { titre: (n: number, nom?: string) => string; description: string; label: string; danger: boolean }
  > = {
    corbeille: {
      titre: (n, nom) =>
        nom ? `Mettre « ${nom} » à la corbeille ?` : `Mettre ${n} fiche${n > 1 ? "s" : ""} à la corbeille ?`,
      description:
        "La fiche disparaît du Kanban, de la Liste et des statistiques. Un admin peut la restaurer depuis la corbeille.",
      label: "Mettre à la corbeille",
      danger: false,
    },
    restaurer: {
      titre: (n, nom) =>
        nom ? `Restaurer « ${nom} » ?` : `Restaurer ${n} fiche${n > 1 ? "s" : ""} ?`,
      description: "La fiche réapparaît partout, avec son historique intact.",
      label: "Restaurer",
      danger: false,
    },
    purger: {
      titre: (n, nom) =>
        nom
          ? `Supprimer définitivement « ${nom} » ?`
          : `Supprimer définitivement ${n} fiche${n > 1 ? "s" : ""} ?`,
      description:
        "Irréversible : notes, activités, devis, factures et documents liés sont effacés.",
      label: "Supprimer définitivement",
      danger: true,
    },
  };

  // Responsables présents dans les leads.
  const respMap = new Map<string, string>();
  let hasUnassigned = false;
  for (const l of source) {
    if (l.assignedTo && l.responsable) {
      respMap.set(l.assignedTo, l.responsable.nom ?? l.responsable.email);
    } else if (!l.assignedTo) {
      hasUnassigned = true;
    }
  }
  const respOptions = [
    { value: "all", label: "Tous les responsables" },
    ...[...respMap.entries()]
      .map(([id, nom]) => ({
        value: id,
        label: id === currentUserId ? `${nom} (moi)` : nom,
        me: id === currentUserId,
      }))
      .sort((a, b) => (a.me ? -1 : b.me ? 1 : a.label.localeCompare(b.label))),
    ...(hasUnassigned ? [{ value: "none", label: "Non assigné" }] : []),
  ];

  // Étapes (limitées au cycle sélectionné).
  const etapeStages = stages
    .filter((s) => filter === 0 || s.cycle === filter)
    .sort((a, b) => a.position - b.position);
  const etapeOptions = [
    { value: "all", label: "Toutes les étapes" },
    ...etapeStages.map((s) => ({ value: s.id, label: s.nom })),
  ];

  // Mois de réception présents (du plus récent au plus ancien).
  const moisOptions = [
    { value: "all", label: "Tous les mois" },
    ...[...new Set(source.map((l) => ymOf(l.createdAt)))]
      .sort()
      .reverse()
      .map((m) => ({ value: m, label: moisLabel(m) })),
  ];

  // Départements présents (2 premiers chiffres du code postal) + nb de leads.
  const deptCounts = new Map<string, number>();
  for (const l of source) {
    const cpv = l.codePostal?.trim();
    if (cpv && cpv.length >= 2) {
      const d = cpv.slice(0, 2);
      deptCounts.set(d, (deptCounts.get(d) ?? 0) + 1);
    }
  }
  const deptOptions = [
    { value: "all", label: "Tous les départements" },
    ...[...deptCounts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([d, n]) => ({ value: d, label: `Dépt ${d} (${n})` })),
  ];

  // Filtres composables (ET).
  const matchResp = (l: Row) =>
    resp === "all" ? true : resp === "none" ? !l.assignedTo : l.assignedTo === resp;
  const matchMois = (l: Row) => mois === "all" || ymOf(l.createdAt) === mois;
  const matchDept = (l: Row) =>
    dept === "all" || (l.codePostal ?? "").slice(0, 2) === dept;
  const matchEtape = (l: Row) => etape === "all" || l.stageId === etape;

  // Base hors cycle (pour les compteurs de cycle), puis cycle + étape.
  const preCycle = source.filter((l) => matchResp(l) && matchMois(l) && matchDept(l));
  const rows = preCycle
    .filter((l) => filter === 0 || l.stage?.cycle === filter)
    .filter(matchEtape);

  const filtresActifs =
    filter !== 0 || etape !== "all" || resp !== "all" || mois !== "all" || dept !== "all";
  function reset() {
    setFilter(0);
    setEtape("all");
    setResp("all");
    setMois("all");
    setDept("all");
  }

  const allFilteredSelected =
    rows.length > 0 && rows.every((r) => selected.has(r.id));
  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (rows.every((r) => next.has(r.id))) rows.forEach((r) => next.delete(r.id));
      else rows.forEach((r) => next.add(r.id));
      return next;
    });
  }

  // Colonne d'actions : uniquement pour un admin (corbeille / restauration).
  const actionsCol = admin && !selectMode;
  const ids = [...selected];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 px-6 pb-3">
        {/* Bandeau corbeille */}
        {vueCorbeille ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <Archive className="size-4" />
            <span className="font-semibold">Corbeille</span>
            <span className="text-xs">
              {corbeille.length} fiche{corbeille.length > 1 ? "s" : ""} supprimée
              {corbeille.length > 1 ? "s" : ""} — restaurables, ou à supprimer définitivement.
            </span>
            <button
              type="button"
              onClick={basculerCorbeille}
              className="ml-auto text-xs font-medium underline-offset-2 hover:underline"
            >
              ← Retour à la liste
            </button>
          </div>
        ) : null}

        {/* Cycle */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5">
            {FILTERS.map((f) => {
              const active = filter === f.id;
              const count =
                f.id === 0
                  ? preCycle.length
                  : preCycle.filter((l) => l.stage?.cycle === f.id).length;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setFilter(f.id);
                    setEtape("all"); // l'étape dépend du cycle
                  }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f.label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[10px] font-bold",
                      active ? "bg-white/20 text-white" : "bg-primary/10 text-primary",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          {admin && !vueCorbeille && corbeille.length > 0 ? (
            <button
              type="button"
              onClick={basculerCorbeille}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Fiches supprimées, restaurables"
            >
              <Archive className="size-3.5" /> Corbeille ({corbeille.length})
            </button>
          ) : null}
        </div>

        {/* Filtres : étape · responsable · mois · code postal */}
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            options={etapeOptions}
            value={etape}
            onChange={setEtape}
            width="w-48"
          />
          <FilterSelect
            options={respOptions}
            value={resp}
            onChange={setResp}
            width="w-52"
          />
          <FilterSelect
            options={moisOptions}
            value={mois}
            onChange={setMois}
            width="w-40"
          />
          <FilterSelect
            options={deptOptions}
            value={dept}
            onChange={setDept}
            width="w-48"
          />
          {filtresActifs ? (
            <button
              type="button"
              onClick={reset}
              className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Réinitialiser
            </button>
          ) : null}
          {selectMode ? (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs font-medium text-foreground">
                {selected.size} sélectionné{selected.size > 1 ? "s" : ""}
              </span>
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-xs font-medium text-primary hover:underline"
              >
                {allFilteredSelected ? "Tout décocher" : "Tout cocher"}
              </button>
              {vueCorbeille ? (
                <>
                  <button
                    type="button"
                    onClick={() => setConfirm({ kind: "restaurer", ids })}
                    disabled={selected.size === 0 || pending}
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    <RotateCcw className="size-3.5" /> Restaurer
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirm({ kind: "purger", ids })}
                    disabled={selected.size === 0 || pending}
                    className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    <Trash2 className="size-3.5" /> Supprimer définitivement
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirm({ kind: "corbeille", ids })}
                  disabled={selected.size === 0 || pending}
                  className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  <Trash2 className="size-3.5" /> Mettre à la corbeille
                </button>
              )}
              <button
                type="button"
                onClick={exitSelect}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Annuler
              </button>
            </div>
          ) : (
            <div className="ml-auto flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {rows.length} résultat{rows.length > 1 ? "s" : ""}
              </span>
              {admin ? (
                <button
                  type="button"
                  onClick={() => setSelectMode(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                >
                  <CheckSquare className="size-3.5" />
                  Sélectionner
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-16 text-center text-sm text-muted-foreground">
          {vueCorbeille ? "La corbeille est vide." : "Aucun prospect dans cette vue."}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col px-6 pb-24">
          {/* overflow-auto (pas hidden) : 13 colonnes défilent horizontalement
              au lieu d'être écrasées / coupées sur un écran de portable. */}
          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border">
            <table className="min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted">
              {selectMode ? (
                <th className="w-10 border-b border-r border-border px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAll}
                    className="size-4 accent-green-700"
                    aria-label="Tout sélectionner"
                  />
                </th>
              ) : null}
              {COLS.map((c) => (
                <th
                  key={c}
                  className="border-b border-r border-border px-3 py-2 text-left text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap"
                >
                  {c}
                </th>
              ))}
              {actionsCol ? (
                <th className="border-b border-border px-3 py-2" />
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((lead) => {
              const s = STATUT[lead.statut] ?? STATUT.en_cours;
              const hasRelance = lead.relanceCount > 0 || !!lead.nextRelanceDate;
              return (
                <tr
                  key={lead.id}
                  onClick={() =>
                    selectMode
                      ? toggleSelect(lead.id)
                      : router.push(`/leads/${lead.id}`)
                  }
                  className={cn(
                    "cursor-pointer bg-white transition-colors",
                    selected.has(lead.id)
                      ? "bg-primary/10 hover:bg-primary/15"
                      : "hover:bg-primary/[0.06]",
                    vueCorbeille && "opacity-80",
                  )}
                >
                  {selectMode ? (
                    <Td className="w-10 text-center">
                      <input
                        type="checkbox"
                        checked={selected.has(lead.id)}
                        readOnly
                        tabIndex={-1}
                        className="pointer-events-none size-4 accent-green-700"
                      />
                    </Td>
                  ) : null}
                  <Td className="font-medium text-foreground">
                    {lead.nom}
                    {vueCorbeille && lead.deletedAt ? (
                      <span className="ml-2 text-[10px] font-normal text-amber-700">
                        supprimé {tempsRelatif(lead.deletedAt)}
                      </span>
                    ) : null}
                  </Td>
                  <Td
                    className="whitespace-nowrap text-muted-foreground"
                    title={formatHorodatage(lead.createdAt)}
                  >
                    {recuIlYA(lead.createdAt)}
                  </Td>
                  <Td>
                    {lead.responsable?.nom ??
                      lead.responsable?.email ?? (
                        <span className="text-muted-foreground">Non assigné</span>
                      )}
                  </Td>
                  <Td>
                    {lead.stage ? (
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: lead.stage.couleur }}
                        />
                        {lead.stage.nom}
                      </span>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        s.cls,
                      )}
                    >
                      {s.label}
                    </span>
                  </Td>
                  <Td>{humanise(lead.dimensions) || humanise(lead.typeProjet) || "—"}</Td>
                  <Td>{lead.codePostal || "—"}</Td>
                  <Td>{humanise(lead.dateSouhaiteeAppel) || "—"}</Td>
                  <Td>{humanise(lead.dateInstallation) || "—"}</Td>
                  <Td className="tabular-nums">{formatEuros(lead.montant)}</Td>
                  <Td className="whitespace-nowrap">
                    {lead.rdvDate ? (
                      <span className="text-blue-700">
                        {formatDateCourte(lead.rdvDate)}
                        {lead.rdvType ? ` · ${lead.rdvType}` : ""}
                      </span>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {hasRelance ? (
                      <span className="text-orange-700">
                        {lead.relanceCount > 0 ? `${lead.relanceCount}×` : ""}
                        {lead.nextRelanceDate
                          ? ` · ${formatDateCourte(lead.nextRelanceDate)}`
                          : ""}
                      </span>
                    ) : (
                      "—"
                    )}
                  </Td>
                  {actionsCol ? (
                    <Td className="whitespace-nowrap text-center">
                      {vueCorbeille ? (
                        <span className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirm({ kind: "restaurer", ids: [lead.id], nom: lead.nom });
                            }}
                            title="Restaurer"
                            aria-label="Restaurer"
                            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                          >
                            <RotateCcw className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirm({ kind: "purger", ids: [lead.id], nom: lead.nom });
                            }}
                            title="Supprimer définitivement"
                            aria-label="Supprimer définitivement"
                            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirm({ kind: "corbeille", ids: [lead.id], nom: lead.nom });
                          }}
                          title="Mettre à la corbeille"
                          aria-label="Mettre à la corbeille"
                          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </Td>
                  ) : null}
                </tr>
              );
            })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {confirm ? (
        <ConfirmDialog
          open
          titre={CONFIRM_TEXTS[confirm.kind].titre(confirm.ids.length, confirm.nom)}
          description={CONFIRM_TEXTS[confirm.kind].description}
          confirmLabel={CONFIRM_TEXTS[confirm.kind].label}
          danger={CONFIRM_TEXTS[confirm.kind].danger}
          pending={pending}
          onConfirm={executer}
          onCancel={() => !pending && setConfirm(null)}
        />
      ) : null}
    </div>
  );
}

