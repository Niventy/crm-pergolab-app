"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, CheckSquare } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { deleteLead, deleteLeads } from "./actions";
import {
  formatEuros,
  formatHorodatage,
  formatDateCourte,
  tempsRelatif,
  humanise,
} from "@/lib/format";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Lead, Stage, Profile } from "@/db/schema";

type Row = Lead & {
  stage: Stage | null;
  responsable: Profile | null;
};

const MOIS_FR = [
  "JANVIER", "FÉVRIER", "MARS", "AVRIL", "MAI", "JUIN",
  "JUILLET", "AOÛT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DÉCEMBRE",
];
function ymOf(d: Date | string): string {
  return (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 7);
}
function moisLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MOIS_FR[Number(m) - 1]} ${y.slice(2)}`;
}

const STATUT: Record<string, { label: string; cls: string }> = {
  en_cours: { label: "En cours", cls: "bg-slate-200 text-slate-700" },
  gagnee: { label: "Gagnée", cls: "bg-green-600 text-white" },
  perdue: { label: "Perdue", cls: "bg-red-600 text-white" },
};

// En-têtes de colonnes (libellé + alignement éventuel).
const COLS = [
  "Nom",
  "Responsable",
  "Étape",
  "Statut",
  "Type de projet",
  "Code postal",
  "Appel souhaité",
  "Installation",
  "Montant",
  "Proba",
  "RDV",
  "Relances",
  "Reçu",
];

const FILTERS = [
  { id: 0, label: "Tous" },
  { id: 1, label: "Prospection" },
  { id: 2, label: "Devis & closing" },
  { id: 3, label: "Pose & technique" },
];

export function ListeTable({
  leads,
  stages,
  currentUserId,
}: {
  leads: Row[];
  stages: Stage[];
  currentUserId?: string | null;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState(0); // cycle
  const [etape, setEtape] = useState("all");
  const [resp, setResp] = useState("all");
  const [mois, setMois] = useState("all");
  const [dept, setDept] = useState("all");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startDelete] = useTransition();

  function onDelete(e: React.MouseEvent, lead: Row) {
    e.stopPropagation();
    if (!confirm(`Supprimer définitivement « ${lead.nom} » ? Cette action est irréversible.`))
      return;
    startDelete(async () => {
      try {
        await deleteLead(lead.id);
        toast.success("Lead supprimé");
      } catch {
        toast.error("Échec de la suppression");
      }
    });
  }

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

  function deleteSelection() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!confirm(`Supprimer définitivement ${ids.length} lead(s) ? Cette action est irréversible.`))
      return;
    startDelete(async () => {
      try {
        await deleteLeads(ids);
        toast.success(`${ids.length} lead(s) supprimé(s)`);
        exitSelect();
      } catch {
        toast.error("Échec de la suppression");
      }
    });
  }

  // Responsables présents dans les leads.
  const respMap = new Map<string, string>();
  let hasUnassigned = false;
  for (const l of leads) {
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
    ...[...new Set(leads.map((l) => ymOf(l.createdAt)))]
      .sort()
      .reverse()
      .map((m) => ({ value: m, label: moisLabel(m) })),
  ];

  // Départements présents (2 premiers chiffres du code postal) + nb de leads.
  const deptCounts = new Map<string, number>();
  for (const l of leads) {
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
  const preCycle = leads.filter((l) => matchResp(l) && matchMois(l) && matchDept(l));
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 px-6 pb-3">
        {/* Cycle */}
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
              <button
                type="button"
                onClick={deleteSelection}
                disabled={selected.size === 0 || pending}
                className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                <Trash2 className="size-3.5" />
                Supprimer
              </button>
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
              <button
                type="button"
                onClick={() => setSelectMode(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
              >
                <CheckSquare className="size-3.5" />
                Sélectionner
              </button>
            </div>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-16 text-center text-sm text-muted-foreground">
          Aucun prospect dans cette vue.
        </div>
      ) : (
        <div className="flex-1 overflow-auto px-6 pb-6">
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
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
              {!selectMode ? (
                <th className="w-10 border-b border-border px-3 py-2" />
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
                  <Td className="font-medium text-foreground">{lead.nom}</Td>
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
                  <Td>{humanise(lead.typeProjet) || "—"}</Td>
                  <Td>{lead.codePostal || "—"}</Td>
                  <Td>{humanise(lead.dateSouhaiteeAppel) || "—"}</Td>
                  <Td>{humanise(lead.dateInstallation) || "—"}</Td>
                  <Td className="tabular-nums">{formatEuros(lead.montant)}</Td>
                  <Td className="tabular-nums">
                    {lead.probabilite !== null ? `${lead.probabilite} %` : "—"}
                  </Td>
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
                  <Td
                    className="whitespace-nowrap text-muted-foreground"
                    title={formatHorodatage(lead.createdAt)}
                  >
                    {tempsRelatif(lead.createdAt)}
                  </Td>
                  {!selectMode ? (
                    <Td className="w-10 text-center">
                      <button
                        type="button"
                        onClick={(e) => onDelete(e, lead)}
                        title="Supprimer"
                        aria-label="Supprimer"
                        className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="size-4" />
                      </button>
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
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <td
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
