"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { setDescriptionSurMesure } from "../actions";

type Composant = { id: string; label: string; groupe: string };

export function DescriptionsSurMesure({
  composants,
  descriptions,
}: {
  composants: Composant[];
  descriptions: Record<string, string>;
}) {
  const groupes = [...new Set(composants.map((c) => c.groupe))];
  return (
    <div className="space-y-6">
      {groupes.map((g) => (
        <section key={g} className="space-y-3">
          <h2 className="text-eyebrow text-muted-foreground">{g}</h2>
          {composants
            .filter((c) => c.groupe === g)
            .map((c) => (
              <Ligne key={c.id} composant={c} initial={descriptions[c.id] ?? ""} />
            ))}
        </section>
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
  const [ouvert, setOuvert] = useState(false);
  const [pending, start] = useTransition();
  const dirty = value !== savedValue;
  const aCompleter =
    !savedValue.trim() || savedValue.trim().toLowerCase() === "manquant";
  const nbLignes = value.split("\n").length;
  const apercu = savedValue.split("\n").map((t) => t.trim()).find(Boolean) ?? "";

  function enregistrer() {
    start(async () => {
      const r = await setDescriptionSurMesure(composant.id, value);
      if (r.ok) {
        setSavedValue(value);
        toast.success(`« ${composant.label} » enregistré`);
      } else toast.error(r.error ?? "Échec");
    });
  }

  return (
    <div className="rounded-xl border border-border bg-white p-3">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOuvert((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-semibold text-foreground"
          title={ouvert ? "Replier" : "Modifier ce texte"}
        >
          <span className="shrink-0">{composant.label}</span>
          {aCompleter && !dirty ? (
            <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
              À compléter
            </span>
          ) : !ouvert ? (
            <span className="truncate text-xs font-normal text-muted-foreground">
              {apercu}
              {savedValue.split("\n").length > 1 ? ` · ${savedValue.split("\n").length} lignes` : ""}
            </span>
          ) : null}
        </button>
        <span className="flex items-center gap-2">
          {!dirty && savedValue && !aCompleter ? (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="size-3.5" /> Enregistré
            </span>
          ) : null}
          {!ouvert ? (
            <button
              type="button"
              onClick={() => setOuvert(true)}
              className="rounded-md border border-border bg-white px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
            >
              {aCompleter ? "Rédiger" : "Modifier"}
            </button>
          ) : (
            <button
              type="button"
              onClick={enregistrer}
              disabled={pending || !dirty}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Enregistrer
            </button>
          )}
        </span>
      </div>
      {ouvert ? (
        <>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={Math.min(30, Math.max(4, nbLignes + 1))}
            placeholder="Texte affiché sous la désignation sur le devis… (« manquant » = rien n'est injecté)"
            className="w-full resize-y rounded-md border border-border bg-white px-2.5 py-1.5 font-mono text-[13px] leading-snug outline-none focus:border-primary"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Texte brut (Pennylane n&apos;interprète pas le gras) : titres en MAJUSCULES, puces « • »,
            lignes vides entre les sections.
          </p>
        </>
      ) : null}
    </div>
  );
}
