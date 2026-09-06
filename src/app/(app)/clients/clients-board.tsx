"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
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
import { MapPin, Ruler, Truck, Wrench, Phone, Clock, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatEuros, formatDateCourte, formatTelephone, tempsRelatif, initiales } from "@/lib/format";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { updateLeadStage } from "@/app/(app)/kanban/actions";
import { changerEtape } from "@/app/(app)/leads/[id]/actions";
import { PHASE_META, PHASE_ORDER, type CommandeRow, type Phase, type StageOption } from "./phases-meta";

// Horodatage du dernier drag : distingue un clic d'un glisser (comme le Kanban vente).
let lastDragEnd = 0;

const encaisse = (r: CommandeRow) => (r.acompteEncaisse ?? 0) + (r.paiementEspece ?? 0);
const reste = (r: CommandeRow): number | null =>
  r.montantTtc == null ? null : Math.max(0, r.montantTtc - encaisse(r));

function PhaseBadge({ phase }: { phase: Phase }) {
  const m = PHASE_META[phase];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        m.cls,
      )}
    >
      <span className={cn("size-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

// --- Carte client (présentation) ------------------------------------------
function ClientCard({ r, dragging }: { r: CommandeRow; dragging?: boolean }) {
  const annulee = r.statut === "perdue";
  const rst = reste(r);
  return (
    <div
      className={cn(
        "rounded-xl border bg-white p-3 text-left transition-all",
        dragging
          ? "border-primary/40 shadow-xl ring-1 ring-primary/30"
          : "border-border shadow-none hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md",
        annulee && "opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={cn("truncate text-[0.95rem] font-medium leading-tight text-foreground", annulee && "line-through")}>
            {r.nom}
          </div>
          {r.produit ? (
            <div className="mt-0.5 truncate text-xs text-muted-foreground">{r.produit}</div>
          ) : null}
        </div>
        {r.equipePose ? (
          <span
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
            title={`Pose : ${r.equipePose}`}
          >
            {initiales(r.equipePose)}
          </span>
        ) : (
          <span
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-700"
            title="Aucun poseur / équipe de pose"
          >
            ?
          </span>
        )}
      </div>

      {/* Argent : TTC + état d'encaissement */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {annulee ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            <Ban className="size-3" /> Annulée
          </span>
        ) : (
          <PhaseBadge phase={r.phase} />
        )}
        <span className="ml-auto text-sm font-semibold tabular-nums text-foreground">
          {r.montantTtc != null ? (
            <>{formatEuros(r.montantTtc)} <span className="text-[10px] font-normal text-muted-foreground">TTC</span></>
          ) : r.montantHt != null ? (
            <>{formatEuros(r.montantHt)} <span className="text-[10px] font-normal text-amber-700">HT · TTC ?</span></>
          ) : (
            "—"
          )}
        </span>
      </div>
      {!annulee && rst != null && rst > 0 ? (
        <div className="mt-1 text-right text-[11px] text-orange-700">
          reste {formatEuros(rst)}
        </div>
      ) : null}

      {/* Chantier : dates clés */}
      <div className="mt-2.5 grid grid-cols-3 gap-1 rounded-lg bg-muted/60 px-2 py-1.5 text-[11px]">
        <Etape Icon={Ruler} label="Métré" date={r.dateMetre} />
        <Etape Icon={Truck} label="Livr." date={r.dateLivraisonPrevue} />
        <Etape Icon={Wrench} label="Pose" date={r.datePoseReelle ?? r.datePosePrevue} fait={!!r.datePoseReelle} />
      </div>

      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <MapPin className="size-3" aria-hidden />
          {[r.codePostal, r.ville].filter(Boolean).join(" ") || "—"}
        </span>
        {r.telephone ? (
          <span className="flex items-center gap-1">
            <Phone className="size-3" aria-hidden />
            {formatTelephone(r.telephone)}
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-1" title="Dernière mise à jour">
          <Clock className="size-3" aria-hidden />
          {tempsRelatif(r.updatedAt)}
        </span>
      </div>
    </div>
  );
}

function Etape({
  Icon,
  label,
  date,
  fait,
}: {
  Icon: typeof Ruler;
  label: string;
  date: string | null;
  fait?: boolean;
}) {
  return (
    <span
      className={cn(
        "flex items-center gap-1 truncate",
        date ? (fait ? "text-green-700" : "text-foreground/80") : "text-muted-foreground/60",
      )}
      title={`${label} ${date ? formatDateCourte(date) : "non planifié"}`}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      {date ? formatDateCourte(date) : "—"}
    </span>
  );
}

// --- Carte déplaçable ------------------------------------------------------
function DraggableCard({ r }: { r: CommandeRow }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: r.id,
  });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;
  return (
    <Link
      ref={setNodeRef}
      href={`/leads/${r.id}`}
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
      <ClientCard r={r} />
    </Link>
  );
}

// --- Colonne ---------------------------------------------------------------
function Column({ stage, rows }: { stage: StageOption; rows: CommandeRow[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = rows.reduce((a, r) => a + (r.montantTtc ?? r.montantHt ?? 0), 0);
  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="flex items-center gap-2 px-1 pb-2">
        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: stage.couleur }} aria-hidden />
        <span className="text-eyebrow text-foreground/80">{stage.nom}</span>
        <span className="ml-auto flex items-baseline gap-1.5 text-xs text-muted-foreground">
          <span className="rounded-full bg-primary/10 px-1.5 font-semibold text-primary">{rows.length}</span>
          {!stage.isPerdue ? <span className="tabular-nums">{formatEuros(total)}</span> : null}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-24 flex-1 flex-col gap-2 rounded-xl border border-dashed p-2 transition-colors",
          isOver
            ? stage.isPerdue
              ? "border-red-300 bg-red-50/60"
              : "border-blue-300 bg-blue-50/50"
            : "border-transparent bg-muted/40",
        )}
      >
        {rows.map((r) => (
          <DraggableCard key={r.id} r={r} />
        ))}
      </div>
    </div>
  );
}

// --- Board -----------------------------------------------------------------
export function ClientsBoard({
  rows: initialRows,
  stages,
  currentUserId,
}: {
  rows: CommandeRow[];
  stages: StageOption[];
  currentUserId: string | null;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<CommandeRow[]>(initialRows);
  // Resynchronise l'état local quand le serveur renvoie de nouvelles données
  // (rafraîchissement périodique / retour sur l'onglet / action d'un collègue).
  // Motif React « ajuster l'état pendant le rendu » (pas d'effet).
  const [prevInitial, setPrevInitial] = useState(initialRows);
  if (initialRows !== prevInitial) {
    setPrevInitial(initialRows);
    setRows(initialRows);
  }
  useAutoRefresh();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mesChantiers, setMesChantiers] = useState(false);
  const [phase, setPhase] = useState<Phase | "all">("all");
  // Dépôt sur « Annulée » : confirmation + motif obligatoire (comme le rail).
  const [annulation, setAnnulation] = useState<{ row: CommandeRow; stage: StageOption } | null>(null);
  const [motif, setMotif] = useState("");
  const [pending, start] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const visibles = useMemo(
    () =>
      rows.filter((r) => {
        if (mesChantiers && r.assignedTo !== currentUserId && r.poseAssignedTo !== currentUserId)
          return false;
        if (phase !== "all" && (r.statut !== "gagnee" || r.phase !== phase)) return false;
        return true;
      }),
    [rows, mesChantiers, phase, currentUserId],
  );

  const parEtape = useMemo(() => {
    const m = new Map<string, CommandeRow[]>();
    for (const s of stages) m.set(s.id, []);
    for (const r of visibles) if (r.stageId && m.has(r.stageId)) m.get(r.stageId)!.push(r);
    return m;
  }, [stages, visibles]);

  // Clients signés dont l'étape n'est pas une étape de chantier (ne devrait
  // plus arriver : la signature démarre le chantier ; garde-fou d'affichage).
  const horsChantier = visibles.filter((r) => !r.stageId || !parEtape.has(r.stageId));

  const active = rows.find((r) => r.id === activeId) ?? null;

  const counts: Record<Phase, number> = { commande: 0, facturation: 0, sav: 0 };
  for (const r of rows) if (r.statut === "gagnee") counts[r.phase]++;

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    lastDragEnd = Date.now();
    const { active: a, over } = e;
    if (!over) return;
    const row = rows.find((r) => r.id === String(a.id));
    const target = stages.find((s) => s.id === String(over.id));
    if (!row || !target || row.stageId === target.id) return;

    if (target.isPerdue) {
      setMotif("");
      setAnnulation({ row, stage: target });
      return;
    }

    const previous = rows;
    setRows((cur) =>
      cur.map((r) =>
        r.id === row.id
          ? { ...r, stageId: target.id, stageNom: target.nom, stageCouleur: target.couleur, statut: "gagnee" }
          : r,
      ),
    );
    const res = await updateLeadStage(row.id, target.id);
    if (res?.error) {
      setRows(previous);
      toast.error("Déplacement impossible", { description: res.error });
    } else {
      router.refresh();
    }
  }

  function confirmerAnnulation() {
    if (!annulation) return;
    const { row, stage } = annulation;
    start(async () => {
      const r = await changerEtape(row.id, stage.id, motif);
      if (r.ok) {
        setRows((cur) =>
          cur.map((x) =>
            x.id === row.id
              ? { ...x, stageId: stage.id, stageNom: stage.nom, stageCouleur: stage.couleur, statut: "perdue" }
              : x,
          ),
        );
        toast.success(`Commande « ${row.nom} » annulée`);
        setAnnulation(null);
        router.refresh();
      } else toast.error(r.error ?? "Échec");
    });
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Filtres : encaissement (badge) + mes chantiers */}
        <div className="flex flex-wrap items-center gap-2 px-6 pt-2 pb-3">
          <div className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5">
            <FiltreChip active={phase === "all"} onClick={() => setPhase("all")} label="Tous" count={rows.filter((r) => r.statut === "gagnee").length} />
            {PHASE_ORDER.map((p) => (
              <FiltreChip
                key={p}
                active={phase === p}
                onClick={() => setPhase(p)}
                label={PHASE_META[p].label}
                count={counts[p]}
                dot={PHASE_META[p].dot}
              />
            ))}
          </div>
          {currentUserId ? (
            <button
              type="button"
              onClick={() => setMesChantiers((v) => !v)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors",
                mesChantiers
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
              title="Clients dont je suis responsable ou poseur"
            >
              Mes chantiers
            </button>
          ) : null}
          <span className="ml-auto text-xs text-muted-foreground">
            Glisse une carte pour faire avancer le chantier · « Annulée » demande un motif
          </span>
        </div>

        {horsChantier.length > 0 ? (
          <div className="mx-6 mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {horsChantier.length} client{horsChantier.length > 1 ? "s" : ""} sans étape de chantier :{" "}
            {horsChantier.map((r, i) => (
              <span key={r.id}>
                {i > 0 ? ", " : ""}
                <Link href={`/leads/${r.id}`} className="font-medium underline-offset-2 hover:underline">
                  {r.nom}
                </Link>
              </span>
            ))}
            {" "}— ouvre la fiche et choisis « À métrer ».
          </div>
        ) : null}

        <div className="flex flex-1 gap-4 overflow-x-auto px-6 pb-24">
          {stages.map((s) => (
            <Column key={s.id} stage={s} rows={parEtape.get(s.id) ?? []} />
          ))}
        </div>
      </div>

      <DragOverlay>
        {active ? (
          <div className="w-72">
            <ClientCard r={active} dragging />
          </div>
        ) : null}
      </DragOverlay>

      <ConfirmDialog
        open={annulation !== null}
        titre={`Annuler la commande de « ${annulation?.row.nom ?? ""} » ?`}
        description="La fiche passe « perdue » et sort du CA. Indique le motif (rétractation, financement refusé, abandon…) : il est conservé dans l'activité."
        confirmLabel="Annuler la commande"
        danger
        pending={pending}
        confirmDisabled={!motif.trim()}
        onConfirm={confirmerAnnulation}
        onCancel={() => !pending && setAnnulation(null)}
      >
        <textarea
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          rows={3}
          autoFocus
          placeholder="Motif de l'annulation (obligatoire)…"
          className="w-full resize-none rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </ConfirmDialog>
    </DndContext>
  );
}

function FiltreChip({
  active,
  onClick,
  label,
  count,
  dot,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  dot?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors",
        active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {dot ? <span className={cn("size-1.5 rounded-full", active ? "bg-white/80" : dot)} /> : null}
      {label}
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
