"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type LeadPick = {
  id: string;
  nom: string;
  codePostal: string | null;
  email: string | null;
  statut: string;
};

const STATUT_META: Record<string, { label: string; cls: string }> = {
  gagnee: { label: "Client", cls: "bg-green-100 text-green-700" },
  en_cours: { label: "Prospect", cls: "bg-slate-100 text-slate-600" },
  perdue: { label: "Perdu", cls: "bg-red-100 text-red-700" },
};

export function NouveauDevisButton({ leads }: { leads: LeadPick[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [goingTo, setGoingTo] = useState<string | null>(null);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = s
      ? leads.filter((l) =>
          [l.nom, l.codePostal, l.email]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(s)),
        )
      : leads;
    return base.slice(0, 40);
  }, [leads, q]);

  function choisir(id: string) {
    setGoingTo(id);
    router.push(`/leads/${id}/devis/nouveau`);
  }

  // Échap ferme la modale.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && goingTo === null) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, goingTo]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
      >
        <Plus className="size-4" /> Créer un devis
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-24"
          onClick={(e) => {
            if (e.target === e.currentTarget && goingTo === null) setOpen(false);
          }}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-foreground">
                  Nouveau devis
                </div>
                <div className="text-xs text-muted-foreground">
                  Choisis le client / prospect concerné
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Fermer"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="border-b border-border p-3">
              <div className="flex items-center gap-2 rounded-md border border-border px-2.5">
                <Search className="size-4 text-muted-foreground" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Rechercher par nom, code postal, email…"
                  className="h-9 w-full bg-transparent text-sm outline-none"
                />
              </div>
            </div>

            <ul className="max-h-80 overflow-y-auto p-1">
              {results.length === 0 ? (
                <li className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Aucun résultat.
                </li>
              ) : (
                results.map((l) => {
                  const m = STATUT_META[l.statut] ?? STATUT_META.en_cours;
                  return (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => choisir(l.id)}
                        disabled={goingTo !== null}
                        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-muted disabled:opacity-60"
                      >
                        <span className="flex-1">
                          <span className="text-sm font-medium text-foreground">
                            {l.nom}
                          </span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {[l.codePostal, l.email].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                            m.cls,
                          )}
                        >
                          {m.label}
                        </span>
                        {goingTo === l.id ? (
                          <Loader2 className="size-4 animate-spin text-primary" />
                        ) : null}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
