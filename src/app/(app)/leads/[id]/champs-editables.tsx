"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { saveLeadChamps } from "./actions";

export type Champ = {
  key: string;
  label: string;
  value: string | null;
  type?: "text" | "email" | "tel";
  full?: boolean; // occupe toute la largeur
  /** Mise en forme d'AFFICHAGE (ex. téléphone « 06 58 24 33 61 ») ; la valeur brute reste éditée. */
  format?: (v: string) => string;
};

// Carte de champs client modifiable sur place, avec trace journalisée.
export function ChampsEditables({
  leadId,
  champs,
}: {
  leadId: string;
  champs: Champ[];
}) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [pending, start] = useTransition();
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(champs.map((c) => [c.key, c.value ?? ""])),
  );

  function annuler() {
    setVals(Object.fromEntries(champs.map((c) => [c.key, c.value ?? ""])));
    setEdit(false);
  }

  function enregistrer() {
    start(async () => {
      const r = await saveLeadChamps(leadId, vals);
      if (r.ok) {
        if (r.changed && r.changed.length > 0) {
          toast.success(`Modifié : ${r.changed.join(", ")}`);
        } else {
          toast.info("Aucune modification");
        }
        setEdit(false);
        router.refresh();
      } else {
        toast.error(r.error ?? "Échec de l'enregistrement");
      }
    });
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-end">
        {edit ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={annuler}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" /> Annuler
            </button>
            <button
              type="button"
              onClick={enregistrer}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Enregistrer
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEdit(true)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="size-3.5" /> Éditer
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {champs.map((c) => (
          <div key={c.key} className={c.full ? "sm:col-span-3" : ""}>
            <div className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
              {c.label}
            </div>
            {edit ? (
              <input
                type={c.type ?? "text"}
                value={vals[c.key] ?? ""}
                onChange={(e) => setVals((v) => ({ ...v, [c.key]: e.target.value }))}
                className="mt-0.5 h-9 w-full rounded-md border border-border bg-white px-2 text-sm outline-none focus:border-primary"
              />
            ) : (
              <div className="mt-0.5 text-sm text-foreground">
                {c.value ? (c.format ? c.format(c.value) : c.value) : "—"}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
