"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { MapPin, Clock, Crosshair, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  formatEuros,
  formatHorodatage,
  formatDateCourte,
  tempsRelatif,
  initiales,
  humanise,
} from "@/lib/format";
import type { Stage, Lead, Profile } from "@/db/schema";
import { updateLeadStage } from "./actions";

// Lead enrichi des profils liés (chargés côté serveur via les relations).
export type LeadWithRel = Lead & {
  responsable: Profile | null;
  modifiePar: Profile | null;
};

function statutPourStage(stage: Stage): Lead["statut"] {
  if (stage.isPerdue) return "perdue";
  if (stage.isGagnee) return "gagnee";
  // Cycle 3 (pose & technique) = après signature : la fiche reste « gagnée ».
  if (stage.cycle === 3) return "gagnee";
  return "en_cours";
}

function nomProfil(p: Profile | null | undefined): string | null {
  return p?.nom ?? p?.email ?? null;
}

// Pastille d'initiales (responsable du lead).
function Avatar({ profil }: { profil: Profile | null }) {
  const nom = nomProfil(profil);
  return (
    <span
      className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
      title={nom ?? "Non assigné"}
    >
      {nom ? initiales(nom) : "?"}
    </span>
  );
}

// Bandeau d'assignation mis en avant : vert si assigné, ambre si à attribuer.
function Assignation({ profil }: { profil: Profile | null }) {
  const nom = nomProfil(profil);
  if (nom) {
    return (
      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-primary/10 py-0.5 pr-2.5 pl-0.5 text-xs font-semibold text-primary">
        <Avatar profil={profil} />
        <span className="truncate">{nom}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
      <span className="size-1.5 rounded-full bg-amber-500" />
      Non assigné
    </span>
  );
}

// Horodatage du dernier drag : permet de distinguer un clic d'un glisser et
// d'éviter d'ouvrir la fiche juste après avoir déposé une carte.
let lastDragEnd = 0;

// --- Carte (présentation) --------------------------------------------------
function LeadCard({ lead, dragging }: { lead: LeadWithRel; dragging?: boolean }) {
  const hasRelance = lead.relanceCount > 0 || !!lead.nextRelanceDate;

  return (
    <div
      className={cn(
        "rounded-xl border bg-white p-3 text-left transition-all",
        dragging
          ? "border-primary/40 shadow-xl ring-1 ring-primary/30"
          : "border-border shadow-none hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md",
      )}
    >
      {/* Nom — mis en avant */}
      <div className="text-[0.95rem] font-medium leading-tight text-foreground">
        {lead.nom}
      </div>

      {/* Assignation — mise en avant */}
      <div className="mt-1.5">
        <Assignation profil={lead.responsable} />
      </div>

      {/* Projet (type ou dimensions) + créneaux souhaités */}
      <div className="mt-2.5 space-y-0.5">
        {humanise(lead.typeProjet) || humanise(lead.dimensions) ? (
          <div className="truncate text-sm font-medium text-foreground">
            {humanise(lead.typeProjet) || humanise(lead.dimensions)}
          </div>
        ) : null}
        {lead.dateSouhaiteeAppel ? (
          <div className="text-xs text-muted-foreground">
            Appel souhaité : {humanise(lead.dateSouhaiteeAppel)}
          </div>
        ) : null}
        {lead.dateInstallation ? (
          <div className="text-xs text-muted-foreground">
            Installation : {humanise(lead.dateInstallation)}
          </div>
        ) : null}
      </div>

      {/* Code postal + réception — mis en avant */}
      <div className="mt-2.5 flex items-center gap-2 rounded-lg bg-muted/60 px-2 py-1.5 text-[11px]">
        <span className="flex items-center gap-1 font-medium text-foreground/80">
          <MapPin className="size-3 text-muted-foreground" aria-hidden />
          {lead.codePostal || "—"}
        </span>
        <span
          className="ml-auto flex items-center gap-1 text-muted-foreground"
          title={`Réceptionné le ${formatHorodatage(lead.createdAt)}`}
        >
          <Clock className="size-3" aria-hidden />
          reçu {tempsRelatif(lead.createdAt) || "—"}
        </span>
      </div>

      {(lead.rdvDate || hasRelance) && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {lead.rdvDate ? (
            <span className="rounded-md bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              RDV {formatDateCourte(lead.rdvDate)}
              {lead.rdvType ? ` · ${lead.rdvType}` : ""}
            </span>
          ) : null}
          {hasRelance ? (
            <span className="rounded-md bg-orange-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              {lead.relanceCount > 0 ? `Relancé ${lead.relanceCount}×` : "Relance"}
              {lead.nextRelanceDate
                ? ` · ${formatDateCourte(lead.nextRelanceDate)}`
                : ""}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

// --- Carte déplaçable ------------------------------------------------------
function DraggableCard({ lead }: { lead: LeadWithRel }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: lead.id });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <Link
      ref={setNodeRef}
      href={`/leads/${lead.id}`}
      draggable={false}
      style={style}
      onClick={(e) => {
        if (Date.now() - lastDragEnd < 250) e.preventDefault();
      }}
      {...listeners}
      {...attributes}
      className={cn(
        "block cursor-grab touch-none rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        isDragging && "opacity-40",
      )}
    >
      <LeadCard lead={lead} />
    </Link>
  );
}

// --- Colonne (zone de dépôt) -----------------------------------------------
function Column({ stage, leads }: { stage: Stage; leads: LeadWithRel[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  const total = leads.reduce((acc, l) => acc + Number(l.montant ?? 0), 0);

  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="flex items-center gap-2 px-1 pb-2">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: stage.couleur }}
          aria-hidden
        />
        <span className="text-eyebrow text-foreground/80">{stage.nom}</span>
        <span className="ml-auto flex items-baseline gap-1.5 text-xs text-muted-foreground">
          <span className="rounded-full bg-primary/10 px-1.5 font-semibold text-primary">
            {leads.length}
          </span>
          <span className="tabular-nums">{formatEuros(total)}</span>
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-24 flex-1 flex-col gap-2 rounded-xl border border-dashed p-2 transition-colors",
          isOver ? "border-blue-300 bg-blue-50/50" : "border-transparent bg-muted/40",
        )}
      >
        {leads.map((lead) => (
          <DraggableCard key={lead.id} lead={lead} />
        ))}
      </div>
    </div>
  );
}

// --- Board -----------------------------------------------------------------
export function KanbanBoard({
  stages,
  leads: initialLeads,
}: {
  stages: Stage[];
  leads: LeadWithRel[];
}) {
  const [leads, setLeads] = useState<LeadWithRel[]>(initialLeads);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [cycle, setCycle] = useState<number>(1);
  const [focusStageId, setFocusStageId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Cycle de chaque étape, pour compter les leads par cycle.
  const stageCycle = useMemo(
    () => new Map(stages.map((s) => [s.id, s.cycle])),
    [stages],
  );
  const cycleCount = (c: number) =>
    leads.filter((l) => l.stageId && stageCycle.get(l.stageId) === c).length;

  const visibleStages = useMemo(
    () => stages.filter((s) => s.cycle === cycle),
    [stages, cycle],
  );

  const leadsByStage = useMemo(() => {
    const map = new Map<string, LeadWithRel[]>();
    for (const stage of stages) map.set(stage.id, []);
    for (const lead of leads) {
      if (lead.stageId && map.has(lead.stageId)) {
        map.get(lead.stageId)!.push(lead);
      }
    }
    return map;
  }, [stages, leads]);

  const activeLead = leads.find((l) => l.id === activeId) ?? null;

  // Mode focus : on n'affiche qu'une seule étape, en grille pleine largeur.
  const focusStage = focusStageId
    ? (stages.find((s) => s.id === focusStageId) ?? null)
    : null;
  const focusLeads = focusStage ? (leadsByStage.get(focusStage.id) ?? []) : [];

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    lastDragEnd = Date.now();
    const { active, over } = event;
    if (!over) return;

    const leadId = String(active.id);
    const overId = String(over.id);
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;

    // Dépôt sur un onglet de cycle → 1ère étape de ce cycle.
    // Sinon, dépôt sur une colonne → cette étape.
    let targetStage: Stage | undefined;
    if (overId.startsWith("cycle-")) {
      const targetCycle = Number(overId.slice("cycle-".length));
      targetStage = stages.find((s) => s.cycle === targetCycle); // stages triés par position
    } else {
      targetStage = stages.find((s) => s.id === overId);
    }
    if (!targetStage) return;

    const targetStageId = targetStage.id;
    if (lead.stageId === targetStageId) return;

    const previous = leads;
    setLeads((curr) =>
      curr.map((l) =>
        l.id === leadId
          ? { ...l, stageId: targetStageId, statut: statutPourStage(targetStage!) }
          : l,
      ),
    );
    // Suivre la carte si elle change de cycle.
    if (targetStage.cycle !== cycle) setCycle(targetStage.cycle);

    const res = await updateLeadStage(leadId, targetStageId);
    if (res?.error) {
      setLeads(previous);
      toast.error("Déplacement impossible", { description: res.error });
    }
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 pt-2 pb-3">
          {focusStage ? (
            <div className="flex items-center gap-2">
              <span className="text-eyebrow text-muted-foreground">Focus</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: focusStage.couleur }}
                />
                {focusStage.nom} · {focusLeads.length}
              </span>
              <button
                type="button"
                onClick={() => setFocusStageId(null)}
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" /> Quitter
              </button>
            </div>
          ) : (
            <CycleTabs
              cycle={cycle}
              onChange={setCycle}
              counts={{ 1: cycleCount(1), 2: cycleCount(2), 3: cycleCount(3) }}
            />
          )}

          <FocusSelect
            stages={stages}
            value={focusStageId}
            onChange={setFocusStageId}
          />
        </div>

        {focusStage ? (
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {focusLeads.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Aucune carte dans « {focusStage.nom} ».
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {focusLeads.map((lead) => (
                  <Link
                    key={lead.id}
                    href={`/leads/${lead.id}`}
                    className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  >
                    <LeadCard lead={lead} />
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-1 gap-4 overflow-x-auto px-6 pb-6">
            {visibleStages.map((stage) => (
              <Column
                key={stage.id}
                stage={stage}
                leads={leadsByStage.get(stage.id) ?? []}
              />
            ))}
          </div>
        )}
      </div>

      <DragOverlay>
        {activeLead ? (
          <div className="w-72">
            <LeadCard lead={activeLead} dragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// --- Sélecteur de focus (afficher une seule étape) -------------------------
function FocusSelect({
  stages,
  value,
  onChange,
}: {
  stages: Stage[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const current = value ? stages.find((s) => s.id === value) : null;
  return (
    <Select
      value={value ?? "none"}
      onValueChange={(v) => onChange(!v || v === "none" ? null : v)}
    >
      <SelectTrigger
        className={cn(
          "h-8 w-52",
          value && "border-primary/40 bg-primary/5 text-primary",
        )}
      >
        <span className="flex items-center gap-1.5 truncate">
          <Crosshair className="size-3.5 shrink-0" />
          <span className="truncate">{current ? current.nom : "Focus une étape"}</span>
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Vue normale</SelectItem>
        {stages.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.nom}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// --- Sélecteur de cycle de vente -------------------------------------------
const CYCLES = [
  { id: 1, label: "Prospection" },
  { id: 2, label: "Devis & closing" },
  { id: 3, label: "Pose & technique" },
];

function CycleTabs({
  cycle,
  onChange,
  counts,
}: {
  cycle: number;
  onChange: (c: number) => void;
  counts: Record<number, number>;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5">
      {CYCLES.map((c) => (
        <CycleTab
          key={c.id}
          c={c}
          active={cycle === c.id}
          count={counts[c.id] ?? 0}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

function CycleTab({
  c,
  active,
  count,
  onChange,
}: {
  c: { id: number; label: string };
  active: boolean;
  count: number;
  onChange: (c: number) => void;
}) {
  // Zone de dépôt : glisser une carte ici la fait basculer dans ce cycle.
  const { setNodeRef, isOver } = useDroppable({ id: `cycle-${c.id}` });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onChange(c.id)}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
        isOver && !active && "ring-2 ring-brand ring-offset-1",
      )}
    >
      {c.label}
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
}
