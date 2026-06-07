"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { searchLeads, type SearchResult } from "@/app/(app)/search-actions";

const STATUT: Record<string, { label: string; cls: string }> = {
  en_cours: { label: "Prospect", cls: "bg-slate-200 text-slate-700" },
  gagnee: { label: "Client", cls: "bg-green-600 text-white" },
  perdue: { label: "Perdu", cls: "bg-red-600 text-white" },
};

export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Recherche débouncée à chaque frappe.
  useEffect(() => {
    const q = query.trim();
    const t = setTimeout(() => {
      if (q.length < 2) {
        setResults([]);
        return;
      }
      startTransition(async () => {
        setResults(await searchLeads(q));
      });
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  // Raccourci ⌘K / Ctrl+K pour focus, Échap pour fermer.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Fermer si clic en dehors.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  function go(id: string) {
    setOpen(false);
    setQuery("");
    setResults([]);
    router.push(`/leads/${id}`);
  }

  const showPanel = open && query.trim().length >= 2;

  return (
    <div
      ref={containerRef}
      className="fixed bottom-4 left-1/2 z-40 w-[min(92vw,560px)] -translate-x-1/2"
    >
      {/* Panneau de résultats (au-dessus de la barre) */}
      {showPanel ? (
        <div className="mb-2 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
          {results.length > 0 ? (
            <ul className="max-h-80 overflow-y-auto p-1">
              {results.map((r) => {
                const s = STATUT[r.statut] ?? STATUT.en_cours;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => go(r.id)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {r.nom}
                          {r.entreprise ? (
                            <span className="font-normal text-muted-foreground">
                              {" "}· {r.entreprise}
                            </span>
                          ) : null}
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {r.stageNom ? (
                            <span className="inline-flex items-center gap-1">
                              <span
                                className="size-2 rounded-full"
                                style={{ backgroundColor: r.stageCouleur ?? "#999" }}
                              />
                              {r.stageNom}
                            </span>
                          ) : null}
                          {r.codePostal ? <span>· {r.codePostal}</span> : null}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                          s.cls,
                        )}
                      >
                        {s.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              {pending ? "Recherche…" : "Aucun résultat"}
            </div>
          )}
        </div>
      ) : null}

      {/* Barre de recherche */}
      <div className="flex items-center gap-2 rounded-full border border-border bg-white px-4 py-2.5 shadow-lg">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Rechercher un prospect ou client…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setResults([]);
              inputRef.current?.focus();
            }}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Effacer"
          >
            <X className="size-4" />
          </button>
        ) : (
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
            ⌘K
          </kbd>
        )}
      </div>
    </div>
  );
}
