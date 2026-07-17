"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { setObjectifMensuel } from "./actions";

type Profil = {
  id: string;
  nom: string | null;
  email: string;
  role: string;
  objectifMensuel: string | null;
};

export function ObjectifsAdmin({ profils }: { profils: Profil[] }) {
  return (
    <ul className="space-y-2">
      {profils.map((p) => (
        <Ligne key={p.id} p={p} />
      ))}
    </ul>
  );
}

function Ligne({ p }: { p: Profil }) {
  const [valeur, setValeur] = useState(p.objectifMensuel ?? "");
  const [pending, start] = useTransition();
  const modifie = valeur !== (p.objectifMensuel ?? "");

  function save() {
    start(async () => {
      const r = await setObjectifMensuel(p.id, valeur);
      if (r.ok) toast.success(`Objectif mis à jour — ${p.nom ?? p.email}`);
      else toast.error(r.error ?? "Échec");
    });
  }

  return (
    <li className="flex items-center gap-2 text-sm">
      <span className="flex-1 truncate text-foreground">
        {p.nom ?? p.email}
        {p.role === "admin" ? (
          <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary">
            admin
          </span>
        ) : null}
      </span>
      <input
        type="number"
        min={0}
        step="100"
        value={valeur}
        onChange={(e) => setValeur(e.target.value)}
        placeholder="—"
        aria-label={`Objectif mensuel de ${p.nom ?? p.email}`}
        className="h-8 w-28 rounded-md border border-border bg-white px-2 text-right tabular-nums outline-none focus:border-primary"
      />
      <span className="text-xs text-muted-foreground">€ / mois</span>
      <button
        type="button"
        onClick={save}
        disabled={pending || !modifie}
        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-30"
        aria-label="Enregistrer"
      >
        <Check className="size-4" />
      </button>
    </li>
  );
}
