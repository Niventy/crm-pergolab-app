"use client";

import { useEffect, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { formatEuros } from "@/lib/format";
import { fetchProduitsReglages, setMappingSurMesure } from "../actions";

type Produit = { id: number; label: string; prixHt: number };
type Opt = { id: string; label: string };

export function MappingSurMesure({
  options,
  mapping,
}: {
  options: Opt[];
  mapping: Record<string, string>;
}) {
  const [produits, setProduits] = useState<Produit[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchProduitsReglages().then((r) => {
      if (r.ok) setProduits(r.produits ?? []);
      else {
        setProduits([]);
        setErr(r.error ?? null);
      }
    });
  }, []);

  return (
    <div className="rounded-xl border border-border bg-white p-4">
      {err && err !== "Pennylane non configuré." ? (
        <p className="mb-3 text-xs text-muted-foreground">Catalogue : {err}</p>
      ) : null}
      {produits && produits.length === 0 ? (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Aucun produit Pennylane récupéré (clé API absente ou catalogue vide).
        </p>
      ) : null}

      <ul className="divide-y divide-border">
        {options.map((o) => (
          <Ligne
            key={o.id}
            option={o}
            produits={produits}
            initial={mapping[o.id] ?? ""}
          />
        ))}
      </ul>
    </div>
  );
}

function Ligne({
  option,
  produits,
  initial,
}: {
  option: Opt;
  produits: Produit[] | null;
  initial: string;
}) {
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  function onChange(v: string) {
    setValue(v);
    setSaved(false);
    start(async () => {
      const r = await setMappingSurMesure(option.id, v || null);
      if (r.ok) setSaved(true);
      else toast.error(r.error ?? "Échec");
    });
  }

  return (
    <li className="flex items-center gap-3 py-2 text-sm">
      <span className="flex-1 text-foreground">{option.label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!produits || produits.length === 0 || pending}
        className="h-9 w-64 rounded-md border border-border bg-white px-2 text-sm outline-none focus:border-primary disabled:opacity-60"
      >
        <option value="">— aucun —</option>
        {(produits ?? []).map((p) => (
          <option key={p.id} value={String(p.id)}>
            {p.label} ({formatEuros(String(p.prixHt))})
          </option>
        ))}
      </select>
      <span className="w-5 text-green-600">
        {saved ? <Check className="size-4" /> : null}
      </span>
    </li>
  );
}
