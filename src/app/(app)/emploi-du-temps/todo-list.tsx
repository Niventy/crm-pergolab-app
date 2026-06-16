"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus, Trash2, Circle, CheckCircle2, CalendarDays, User } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDateCourte } from "@/lib/format";
import type { Tache } from "@/db/schema";
import { addTache, toggleTache, deleteTache } from "./actions";

type TacheAvecLead = Tache & { lead: { id: string; nom: string } | null };
type LeadOption = { id: string; nom: string };

function todayISO() {
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, heure locale
}

const GROUPES = [
  { key: "retard", titre: "En retard", cls: "text-red-600" },
  { key: "aujourdhui", titre: "Aujourd'hui", cls: "text-primary" },
  { key: "avenir", titre: "À venir", cls: "text-foreground" },
  { key: "sansdate", titre: "Sans échéance", cls: "text-muted-foreground" },
  { key: "fait", titre: "Fait", cls: "text-muted-foreground" },
] as const;

type GroupKey = (typeof GROUPES)[number]["key"];

function groupeDe(t: Tache, today: string): GroupKey {
  if (t.fait) return "fait";
  if (!t.echeance) return "sansdate";
  if (t.echeance < today) return "retard";
  if (t.echeance === today) return "aujourdhui";
  return "avenir";
}

export function TodoList({
  taches,
  leadOptions,
}: {
  taches: TacheAvecLead[];
  leadOptions: LeadOption[];
}) {
  const [titre, setTitre] = useState("");
  const [echeance, setEcheance] = useState("");
  const [leadId, setLeadId] = useState("");
  const [pending, start] = useTransition();
  const today = todayISO();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = titre.trim();
    if (!t) return;
    start(async () => {
      const r = await addTache(t, echeance || null, leadId || null);
      if (r.ok) {
        setTitre("");
        setEcheance("");
        setLeadId("");
      } else {
        toast.error(r.error ?? "Échec de l'ajout");
      }
    });
  }

  const parGroupe: Record<GroupKey, TacheAvecLead[]> = {
    retard: [],
    aujourdhui: [],
    avenir: [],
    sansdate: [],
    fait: [],
  };
  for (const t of taches) parGroupe[groupeDe(t, today)].push(t);
  for (const k of Object.keys(parGroupe) as GroupKey[]) {
    parGroupe[k].sort((a, b) =>
      (a.echeance ?? "9999").localeCompare(b.echeance ?? "9999"),
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <input
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          placeholder="Nouvelle tâche…"
          className="h-9 min-w-[180px] flex-1 rounded-md border border-border bg-transparent px-3 text-sm outline-none focus:border-primary"
        />
        <select
          value={leadId}
          onChange={(e) => setLeadId(e.target.value)}
          aria-label="Rattacher à un lead"
          className="h-9 w-44 rounded-md border border-border bg-transparent px-2 text-sm text-muted-foreground outline-none focus:border-primary"
        >
          <option value="">Lien lead (option.)</option>
          {leadOptions.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nom}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={echeance}
          onChange={(e) => setEcheance(e.target.value)}
          aria-label="Échéance"
          className="h-9 rounded-md border border-border bg-transparent px-2 text-sm text-muted-foreground outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={pending || !titre.trim()}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus className="size-4" /> Ajouter
        </button>
      </form>

      {taches.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Aucune tâche pour l&apos;instant.
        </p>
      ) : (
        GROUPES.map((g) => {
          const items = parGroupe[g.key];
          if (items.length === 0) return null;
          return (
            <section key={g.key}>
              <h3 className={cn("mb-1.5 text-xs font-semibold", g.cls)}>
                {g.titre} · {items.length}
              </h3>
              <ul className="space-y-1.5">
                {items.map((t) => (
                  <TacheRow key={t.id} t={t} today={today} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

function TacheRow({ t, today }: { t: TacheAvecLead; today: string }) {
  const [pending, start] = useTransition();
  const enRetard = !t.fait && t.echeance && t.echeance < today;

  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-white px-3 py-2",
        t.fait && "opacity-60",
      )}
    >
      <button
        type="button"
        onClick={() => start(() => toggleTache(t.id, !t.fait))}
        disabled={pending}
        className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
        aria-label={t.fait ? "Marquer à faire" : "Marquer fait"}
      >
        {t.fait ? (
          <CheckCircle2 className="size-5 text-green-600" />
        ) : (
          <Circle className="size-5" />
        )}
      </button>
      <span
        className={cn(
          "flex-1 text-sm",
          t.fait && "text-muted-foreground line-through",
        )}
      >
        {t.titre}
      </span>
      {t.lead ? (
        <Link
          href={`/leads/${t.lead.id}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex max-w-[140px] items-center gap-1 truncate rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20"
        >
          <User className="size-3 shrink-0" />
          <span className="truncate">{t.lead.nom}</span>
        </Link>
      ) : null}
      {t.echeance ? (
        <span
          className={cn(
            "inline-flex items-center gap-1 whitespace-nowrap text-xs",
            enRetard ? "text-red-600" : "text-muted-foreground",
          )}
        >
          <CalendarDays className="size-3.5" />
          {formatDateCourte(t.echeance)}
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => start(() => deleteTache(t.id))}
        disabled={pending}
        className="shrink-0 text-muted-foreground transition-colors hover:text-red-600"
        aria-label="Supprimer"
      >
        <Trash2 className="size-4" />
      </button>
    </li>
  );
}
