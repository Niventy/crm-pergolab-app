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
import { MapPin, HardHat, Ruler, Wrench, Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatEuros, formatDateCourte } from "@/lib/format";
import type { Stage } from "@/db/schema";
import { updateLeadStage } from "@/app/(app)/kanban/actions";

export type ChantierCard = {
  id: string;
  stageId: string | null;
  nom: string;
  ville: string | null;
  codePostal: string | null;
  equipePose: string | null;
  dateMetre: string | null;
  datePosePrevue: string | null;
  datePoseReelle: string | null;
  reste: number;
  factureSoldeClient: boolean;
  factureSoldePoseur: boolean;
};

let lastDragEnd = 0;

function Card({ c, dragging }: { c: ChantierCard; dragging?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-white p-3 text-left transition-all",
        dragging
          ? "border-primary/40 shadow-xl ring-1 ring-primary/30"
          : "border-border hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md",
      )}
    >
      <div className="text-[0.95rem] font-medium leading-tight text-foreground">
        {c.nom}
      </div>

      <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
          <HardHat className="size-3" />
          {c.equipePose ?? "Équipe à définir"}
        </span>
      </div>

      {/* Dates métré / pose */}
      {(c.dateMetre || c.datePosePrevue || c.datePoseReelle) && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
          {c.dateMetre ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-1.5 py-0.5 text-violet-700">
              <Ruler className="size-3" /> Métré {formatDateCourte(c.dateMetre)}
            </span>
          ) : null}
          {c.datePoseReelle ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-emerald-700">
              <Wrench className="size-3" /> Posé {formatDateCourte(c.datePoseReelle)}
            </span>
          ) : c.datePosePrevue ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-teal-100 px-1.5 py-0.5 text-teal-700">
              <Wrench className="size-3" /> Pose {formatDateCourte(c.datePosePrevue)}
            </span>
          ) : null}
        </div>
      )}

      <div className="mt-2.5 flex items-center gap-2 rounded-lg bg-muted/60 px-2 py-1.5 text-[11px]">
        <span className="flex items-center gap-1 font-medium text-foreground/80">
          <MapPin className="size-3 text-muted-foreground" />
          {[c.codePostal, c.ville].filter(Boolean).join(" ") || "—"}
        </span>
        <span className="ml-auto tabular-nums text-orange-700" title="Reste à encaisser">
          {c.reste > 0 ? `Reste ${formatEuros(c.reste)}` : "Soldé"}
        </span>
      </div>

      {/* Dossier admin */}
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Flag on={c.factureSoldeClient} /> Fact. client
        <Flag on={c.factureSoldePoseur} /> Fact. poseur
      </div>
    </div>
  );
}

function Flag({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex size-3.5 items-center justify-center rounded",
        on ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-400",
      )}
    >
      {on ? <Check className="size-2.5" /> : <Minus className="size-2.5" />}
    </span>
  );
}

function DraggableCard({ c }: { c: ChantierCard }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: c.id,
  });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;
  return (
    <Link
      ref={setNodeRef}
      href={`/leads/${c.id}`}
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
      <Card c={c} />
    </Link>
  );
}

function Column({ stage, cards }: { stage: Stage; cards: ChantierCard[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const reste = cards.reduce((a, c) => a + c.reste, 0);
  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="flex items-center gap-2 px-1 pb-2">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: stage.couleur }}
        />
        <span className="text-eyebrow text-foreground/80">{stage.nom}</span>
        <span className="ml-auto flex items-baseline gap-1.5 text-xs text-muted-foreground">
          <span className="rounded-full bg-primary/10 px-1.5 font-semibold text-primary">
            {cards.length}
          </span>
          {reste > 0 ? (
            <span className="tabular-nums text-orange-700">{formatEuros(reste)}</span>
          ) : null}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-24 flex-1 flex-col gap-2 rounded-xl border border-dashed p-2 transition-colors",
          isOver ? "border-blue-300 bg-blue-50/50" : "border-transparent bg-muted/40",
        )}
      >
        {cards.map((c) => (
          <DraggableCard key={c.id} c={c} />
        ))}
      </div>
    </div>
  );
}

export function ChantiersBoard({
  stages,
  cards: initial,
}: {
  stages: Stage[];
  cards: ChantierCard[];
}) {
  const [cards, setCards] = useState<ChantierCard[]>(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const byStage = useMemo(() => {
    const map = new Map<string, ChantierCard[]>();
    for (const s of stages) map.set(s.id, []);
    // Fiches signées mais sans étape de chantier connue → 1ère colonne (Signée).
    const fallback = stages[0]?.id ?? null;
    for (const c of cards) {
      const key = c.stageId && map.has(c.stageId) ? c.stageId : fallback;
      if (key && map.has(key)) map.get(key)!.push(c);
    }
    return map;
  }, [stages, cards]);

  const active = cards.find((c) => c.id === activeId) ?? null;

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }
  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    lastDragEnd = Date.now();
    const { active: a, over } = e;
    if (!over) return;
    const id = String(a.id);
    const target = String(over.id);
    const card = cards.find((c) => c.id === id);
    if (!card || card.stageId === target) return;

    const previous = cards;
    setCards((cur) => cur.map((c) => (c.id === id ? { ...c, stageId: target } : c)));
    const res = await updateLeadStage(id, target);
    if (res?.error) {
      setCards(previous);
      toast.error("Déplacement impossible", { description: res.error });
    }
  }

  if (stages.length === 0) {
    return (
      <p className="px-6 py-16 text-center text-sm text-muted-foreground">
        Aucune étape de chantier configurée.
      </p>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex flex-1 gap-4 overflow-x-auto px-6 pb-6">
        {stages.map((s) => (
          <Column key={s.id} stage={s} cards={byStage.get(s.id) ?? []} />
        ))}
      </div>
      <DragOverlay>
        {active ? (
          <div className="w-72">
            <Card c={active} dragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
