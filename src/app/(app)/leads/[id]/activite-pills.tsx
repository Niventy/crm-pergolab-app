"use client";

import { useState, useTransition } from "react";
import {
  Phone,
  RefreshCw,
  Mail,
  CalendarCheck,
  FileText,
  Ruler,
  ShoppingCart,
  Truck,
  Wrench,
  ArrowRight,
  UserCheck,
  Plus,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tempsRelatif } from "@/lib/format";
import { logActivite } from "./actions";

type Activite = {
  id: string;
  type: string;
  contenu: string | null;
  date: Date | string;
  auteur: { nom: string | null; email: string } | null;
};

// Métadonnées d'affichage par type (libellé, icône, couleur).
const META: Record<
  string,
  { label: string; Icon: typeof Phone; cls: string }
> = {
  appel: { label: "Appel passé", Icon: Phone, cls: "bg-blue-100 text-blue-700" },
  relance: {
    label: "Relance effectuée",
    Icon: RefreshCw,
    cls: "bg-orange-100 text-orange-700",
  },
  email: { label: "Email envoyé", Icon: Mail, cls: "bg-violet-100 text-violet-700" },
  rdv_honore: {
    label: "RDV honoré",
    Icon: CalendarCheck,
    cls: "bg-teal-100 text-teal-700",
  },
  devis_envoye: {
    label: "Devis envoyé",
    Icon: FileText,
    cls: "bg-emerald-100 text-emerald-700",
  },
  metre: { label: "Métré réalisé", Icon: Ruler, cls: "bg-violet-100 text-violet-700" },
  commande: {
    label: "Commande passée",
    Icon: ShoppingCart,
    cls: "bg-indigo-100 text-indigo-700",
  },
  livre: { label: "Livré", Icon: Truck, cls: "bg-sky-100 text-sky-700" },
  pose: { label: "Posé", Icon: Wrench, cls: "bg-emerald-100 text-emerald-700" },
  etape: { label: "Étape", Icon: ArrowRight, cls: "bg-slate-100 text-slate-700" },
  attribution: {
    label: "Attribution",
    Icon: UserCheck,
    cls: "bg-amber-100 text-amber-700",
  },
};

// Pilules proposées selon le cycle de la fiche (1=prospection, 2=devis, 3=pose).
const PILLS_BY_CYCLE: Record<number, string[]> = {
  1: ["appel", "relance", "email", "rdv_honore"],
  2: ["email", "relance", "devis_envoye", "rdv_honore"],
  3: ["metre", "commande", "livre", "pose"],
};

// Date +7 jours au format YYYY-MM-DD pour le champ date.
function dansSeptJours(): string {
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function ActivitePills({
  leadId,
  cycle,
  activites,
}: {
  leadId: string;
  cycle: number;
  activites: Activite[];
}) {
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<null | "relance" | "autre">(null);
  const [relanceDate, setRelanceDate] = useState(dansSeptJours);
  const [customLabel, setCustomLabel] = useState("");

  const pills = (PILLS_BY_CYCLE[cycle] ?? PILLS_BY_CYCLE[1]).map((type) => ({
    type,
    ...META[type],
  }));

  function run(type: string, options?: { label?: string; nextRelanceDate?: string }) {
    startTransition(async () => {
      try {
        await logActivite(leadId, type, options);
        toast.success("Activité enregistrée");
        setMode(null);
        setCustomLabel("");
        setRelanceDate(dansSeptJours());
      } catch {
        toast.error("Échec de l'enregistrement");
      }
    });
  }

  function onPill(type: string) {
    if (type === "relance") {
      setMode((m) => (m === "relance" ? null : "relance"));
      return;
    }
    run(type);
  }

  return (
    <div className="space-y-3">
      {/* Barre de pilules */}
      <div className="flex flex-wrap gap-1.5">
        {pills.map(({ type, label, Icon }) => (
          <button
            key={type}
            type="button"
            disabled={pending}
            onClick={() => onPill(type)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50",
            )}
          >
            <Icon className="size-3.5 text-muted-foreground" aria-hidden />
            {label}
          </button>
        ))}
        <button
          type="button"
          disabled={pending}
          onClick={() => setMode((m) => (m === "autre" ? null : "autre"))}
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border bg-white px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
        >
          <Plus className="size-3.5" aria-hidden />
          Autre…
        </button>
      </div>

      {/* Saisie « Relance effectuée » → prochaine date */}
      {mode === "relance" ? (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-orange-200 bg-orange-50/60 p-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">
              Prochaine relance
            </label>
            <Input
              type="date"
              value={relanceDate}
              onChange={(e) => setRelanceDate(e.target.value)}
              className="h-8 w-44"
            />
          </div>
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => run("relance", { nextRelanceDate: relanceDate })}
          >
            <Check className="size-3.5" /> Enregistrer la relance
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => setMode(null)}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ) : null}

      {/* Saisie pilule personnalisée */}
      {mode === "autre" ? (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-muted/40 p-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">
              Libellé de l&apos;activité
            </label>
            <Input
              value={customLabel}
              placeholder="ex. Relance SMS, Visite showroom…"
              onChange={(e) => setCustomLabel(e.target.value)}
              className="h-8 w-64"
            />
          </div>
          <Button
            type="button"
            size="sm"
            disabled={pending || !customLabel.trim()}
            onClick={() => run("autre", { label: customLabel })}
          >
            <Check className="size-3.5" /> Ajouter
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => setMode(null)}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ) : null}

      {/* Timeline des activités */}
      {activites.length > 0 ? (
        <ul className="space-y-1.5 pt-1">
          {activites.map((a) => {
            const meta = META[a.type];
            const Icon = meta?.Icon ?? Plus;
            // Pour les types « libres » (étape, autre), on montre le texte saisi.
            const label = a.contenu ?? meta?.label ?? a.type;
            const auteur = a.auteur?.nom ?? a.auteur?.email ?? "Inconnu";
            return (
              <li key={a.id} className="flex items-center gap-2 text-xs">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium",
                    meta?.cls ?? "bg-slate-100 text-slate-700",
                  )}
                >
                  <Icon className="size-3" aria-hidden />
                  {label}
                </span>
                <span className="text-muted-foreground">
                  {auteur} · {tempsRelatif(a.date)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          Aucune activité enregistrée. Clique sur une pilule pour démarrer le suivi.
        </p>
      )}
    </div>
  );
}
