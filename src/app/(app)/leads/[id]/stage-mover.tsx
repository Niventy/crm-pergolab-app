"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { changerEtape } from "./actions";

type StageLite = {
  id: string;
  nom: string;
  couleur: string;
  cycle: number;
  position: number;
};

const CYCLE_LABEL: Record<number, string> = {
  1: "Prospection",
  2: "Devis & closing",
  3: "Pose & technique",
};

export function StageMover({
  leadId,
  stages,
  currentStageId,
  isClient = false,
}: {
  leadId: string;
  stages: StageLite[];
  currentStageId: string | null;
  /** Fiche « client » (gagnée) : on n'affiche QUE le cycle pose & technique. */
  isClient?: boolean;
}) {
  const [target, setTarget] = useState<StageLite | null>(null);
  const [commentaire, setCommentaire] = useState("");
  const [pending, start] = useTransition();

  const commentaireRequis = target ? target.nom !== "Pas de réponse" : false;

  function choisir(s: StageLite) {
    if (s.id === currentStageId) return;
    setTarget(s);
    setCommentaire("");
  }

  // Base prospect = cycles 1 & 2 · Base client = cycle 3 uniquement. Un lead
  // gagné change de base : on ne montre plus la prospection ni le closing.
  const cyclesVisibles = isClient ? [3] : [1, 2];
  const stagesVisibles = stages.filter((s) => cyclesVisibles.includes(s.cycle));

  // Client fraîchement signé encore sur « Signée » (cycle 2) : son étape actuelle
  // n'est pas dans le cycle pose → on l'invite à choisir la 1ère étape.
  const etapeActuelleVisible = stagesVisibles.some((s) => s.id === currentStageId);
  const clientSansPose = isClient && !etapeActuelleVisible;

  function confirmer() {
    if (!target) return;
    if (commentaireRequis && !commentaire.trim()) {
      toast.error("Un commentaire est obligatoire pour ce déplacement.");
      return;
    }
    start(async () => {
      const r = await changerEtape(leadId, target.id, commentaire);
      if (r.ok) {
        toast.success(`Déplacé en « ${target.nom} »`);
        setTarget(null);
        setCommentaire("");
      } else {
        toast.error(r.error ?? "Échec du déplacement");
      }
    });
  }

  const cycles = [...new Set(stagesVisibles.map((s) => s.cycle))].sort();

  return (
    <div className="space-y-3">
      {clientSansPose ? (
        <div className="rounded-lg border border-green-600/30 bg-green-50 px-3 py-2 text-xs text-green-800">
          Fiche <strong>signée (client)</strong> : elle a quitté la prospection.
          Choisis la 1<sup>re</sup> étape de pose ci-dessous pour démarrer le
          chantier.
        </div>
      ) : null}
      {cycles.map((cy) => (
        <div key={cy} className="space-y-1.5">
          <div className="text-eyebrow text-muted-foreground">
            {CYCLE_LABEL[cy] ?? `Cycle ${cy}`}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {stagesVisibles
              .filter((s) => s.cycle === cy)
              .sort((a, b) => a.position - b.position)
              .map((s) => {
                const actuel = s.id === currentStageId;
                const vise = target?.id === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={pending || actuel}
                    onClick={() => choisir(s)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      actuel
                        ? "border-transparent text-white shadow-sm"
                        : vise
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-white text-foreground hover:border-primary/40 hover:bg-primary/5",
                    )}
                    style={actuel ? { backgroundColor: s.couleur } : undefined}
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: actuel ? "rgba(255,255,255,0.85)" : s.couleur }}
                    />
                    {s.nom}
                    {actuel ? " · actuelle" : ""}
                  </button>
                );
              })}
          </div>
        </div>
      ))}

      {target ? (
        <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/[0.04] p-3">
          <div className="text-sm">
            Déplacer vers{" "}
            <span className="font-semibold text-foreground">{target.nom}</span>
            {commentaireRequis ? (
              <span className="text-red-600"> · commentaire obligatoire</span>
            ) : (
              <span className="text-muted-foreground"> · commentaire optionnel</span>
            )}
          </div>
          <textarea
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            rows={2}
            autoFocus
            placeholder={
              commentaireRequis
                ? "Que s'est-il passé ? (ex. RDV fixé jeudi 14h, devis à 18k…)"
                : "Commentaire (facultatif)…"
            }
            className="w-full resize-none rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pending || (commentaireRequis && !commentaire.trim())}
              onClick={confirmer}
            >
              <Check className="size-3.5" /> Confirmer le déplacement
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setTarget(null)}
            >
              <X className="size-3.5" /> Annuler
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {isClient
            ? "Clique sur une étape pour faire avancer le chantier (un commentaire sera demandé)."
            : "Clique sur une étape pour y déplacer le lead (un commentaire sera demandé, sauf pour « Pas de réponse »)."}
        </p>
      )}
    </div>
  );
}
