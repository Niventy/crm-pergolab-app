"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { creerPoseur, setPoseurLead } from "./poseur-actions";

export type PoseurOption = { id: string; nom: string; actif: boolean };

const NOUVEAU = "__nouveau";

const STYLES = {
  // En-tête de fiche : se lit comme du texte, devient un champ au survol.
  entete:
    "-mx-1 h-7 w-[calc(100%+0.5rem)] cursor-pointer rounded-md border border-transparent bg-transparent px-1 text-sm font-semibold outline-none hover:border-border focus:border-primary",
  // Bloc « Chantier » : champ de formulaire.
  champ:
    "h-9 w-full cursor-pointer rounded-md border border-border bg-white px-2 text-sm outline-none focus:border-primary",
  // Tableau clients : discret dans la cellule.
  tableau:
    "h-7 w-full max-w-[10rem] cursor-pointer rounded-md border border-transparent bg-transparent px-1 text-sm outline-none hover:border-border focus:border-primary",
} as const;

// Poseur d'un chantier, choisi À UN CLIC dans la liste (Réglages → Poseurs),
// sans passer par « Planifier / modifier ». « Nouveau poseur… » l'ajoute à la
// liste et l'affecte dans la foulée.
export function PoseurSelect({
  leadId,
  poseurs,
  poseurId,
  texteLibre,
  variante = "champ",
}: {
  leadId: string;
  poseurs: PoseurOption[];
  poseurId: string | null;
  /** Ancienne saisie libre (« BENJ 04 AOUT ») rappelée tant qu'aucun poseur n'est choisi. */
  texteLibre?: string | null;
  variante?: keyof typeof STYLES;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [choix, setChoix] = useState<string | null>(poseurId);
  const [saisie, setSaisie] = useState(false);
  const [nom, setNom] = useState("");

  const valeur = pending ? choix : poseurId;
  // Proposés : les actifs + celui de la fiche même s'il a été retiré de la liste.
  const options = poseurs.filter((p) => p.actif || p.id === valeur);

  function choisir(v: string) {
    if (v === NOUVEAU) {
      setNom("");
      setSaisie(true);
      return;
    }
    const id = v || null;
    if (id === poseurId) return;
    setChoix(id);
    start(async () => {
      const r = await setPoseurLead(leadId, id);
      if (r.ok) {
        const p = poseurs.find((x) => x.id === id);
        toast.success(p ? `Poseur : ${p.nom}` : "Poseur retiré");
        router.refresh();
      } else toast.error("Changement impossible", { description: r.error ?? undefined });
    });
  }

  function ajouter() {
    const n = nom.trim();
    if (!n) return;
    start(async () => {
      const r = await creerPoseur({ nom: n, leadId });
      if (r.ok) {
        toast.success(`Poseur : ${n}`, { description: "Ajouté à la liste des poseurs." });
        setChoix(r.id ?? null);
        setSaisie(false);
        router.refresh();
      } else toast.error("Ajout impossible", { description: r.error ?? undefined });
    });
  }

  if (saisie)
    return (
      <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={nom}
          disabled={pending}
          onChange={(e) => setNom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") ajouter();
            if (e.key === "Escape") setSaisie(false);
          }}
          placeholder="Nom du poseur"
          className="h-8 w-full min-w-0 rounded-md border border-border bg-white px-2 text-sm font-normal outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={ajouter}
          disabled={pending || !nom.trim()}
          title="Ajouter et affecter"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        </button>
        <button
          type="button"
          onClick={() => setSaisie(false)}
          disabled={pending}
          title="Annuler"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </span>
    );

  return (
    <span className="block min-w-0" onClick={(e) => e.stopPropagation()}>
      <select
        value={valeur ?? ""}
        disabled={pending}
        onChange={(e) => choisir(e.target.value)}
        aria-label="Poseur"
        className={cn(
          STYLES[variante],
          "disabled:opacity-50",
          !valeur && (variante === "entete" ? "text-amber-800" : "text-amber-700"),
        )}
      >
        <option value="">{variante === "entete" ? "Poseur non affecté" : "Non affecté"}</option>
        {options.map((p) => (
          <option key={p.id} value={p.id} className="text-foreground">
            {p.nom}
            {p.actif ? "" : " (retiré)"}
          </option>
        ))}
        <option value={NOUVEAU} className="text-foreground">
          + Nouveau poseur…
        </option>
      </select>
      {!valeur && texteLibre ? (
        <span
          className="block truncate text-xs font-normal text-muted-foreground"
          title={`Saisie libre : ${texteLibre}`}
        >
          Saisi : {texteLibre}
        </span>
      ) : null}
    </span>
  );
}
