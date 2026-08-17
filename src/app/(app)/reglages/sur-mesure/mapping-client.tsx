"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { setDescriptionSurMesure } from "../actions";

type Composant = { id: string; label: string };

export function DescriptionsSurMesure({
  composants,
  descriptions,
}: {
  composants: Composant[];
  descriptions: Record<string, string>;
}) {
  return (
    <div className="space-y-3">
      {composants.map((c) => (
        <Ligne key={c.id} composant={c} initial={descriptions[c.id] ?? ""} />
      ))}
    </div>
  );
}

function Ligne({
  composant,
  initial,
}: {
  composant: Composant;
  initial: string;
}) {
  const [value, setValue] = useState(initial);
  const [savedValue, setSavedValue] = useState(initial);
  const [pending, start] = useTransition();
  const dirty = value !== savedValue;

  function enregistrer() {
    start(async () => {
      const r = await setDescriptionSurMesure(composant.id, value);
      if (r.ok) setSavedValue(value);
      else toast.error(r.error ?? "Échec");
    });
  }

  return (
    <div className="rounded-xl border border-border bg-white p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">
          {composant.label}
        </span>
        <span className="flex items-center gap-2">
          {!dirty && savedValue ? (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="size-3.5" /> Enregistré
            </span>
          ) : null}
          <button
            type="button"
            onClick={enregistrer}
            disabled={pending || !dirty}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Enregistrer
          </button>
        </span>
      </div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={2}
        placeholder="Description affichée sur la ligne du devis…"
        className="w-full resize-y rounded-md border border-border bg-white px-2.5 py-1.5 text-sm outline-none focus:border-primary"
      />
    </div>
  );
}
