"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { initiales, tempsRelatif } from "@/lib/format";

export type Commentaire = {
  id: string;
  kind: "note" | "echange";
  type: string;
  date: string; // ISO
  contenu: string;
  auteurId: string | null;
  auteurNom: string;
  leadId: string;
  leadNom: string;
};

// Libellé + couleur de pastille par type d'activité.
const TYPE_META: Record<string, { label: string; cls: string }> = {
  note: { label: "Conversation", cls: "bg-lime-100 text-lime-800" },
  etape: { label: "Étape", cls: "bg-slate-100 text-slate-700" },
  appel: { label: "Appel", cls: "bg-blue-100 text-blue-700" },
  relance: { label: "Relance", cls: "bg-orange-100 text-orange-700" },
  email: { label: "Email", cls: "bg-sky-100 text-sky-700" },
  rdv_honore: { label: "RDV", cls: "bg-violet-100 text-violet-700" },
  devis_envoye: { label: "Devis", cls: "bg-cyan-100 text-cyan-700" },
  autre: { label: "Note", cls: "bg-slate-100 text-slate-700" },
};
const meta = (t: string) =>
  TYPE_META[t] ?? { label: t, cls: "bg-slate-100 text-slate-700" };

export function CommentairesFeed({
  items,
  profiles,
}: {
  items: Commentaire[];
  profiles: { id: string; nom: string }[];
}) {
  const [auteur, setAuteur] = useState("");
  const [kind, setKind] = useState<"" | "note" | "echange">("");
  const [q, setQ] = useState("");

  const filtres = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((it) => {
      if (auteur && it.auteurId !== auteur) return false;
      if (kind && it.kind !== kind) return false;
      if (
        needle &&
        !it.contenu.toLowerCase().includes(needle) &&
        !it.leadNom.toLowerCase().includes(needle) &&
        !it.auteurNom.toLowerCase().includes(needle)
      )
        return false;
      return true;
    });
  }, [items, auteur, kind, q]);

  // Compteur par auteur (sur l'ensemble, pour la vue d'équipe).
  const parAuteur = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) m.set(it.auteurNom, (m.get(it.auteurNom) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  return (
    <div className="space-y-4">
      {/* Récap par personne */}
      <div className="flex flex-wrap gap-2">
        {parAuteur.map(([nom, n]) => (
          <span
            key={nom}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-2.5 py-1 text-xs"
          >
            <span className="grid size-5 place-items-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
              {initiales(nom)}
            </span>
            {nom}
            <span className="font-semibold text-muted-foreground">{n}</span>
          </span>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher un commentaire, un client…"
            className="h-9 w-full rounded-md border border-border bg-white pl-8 pr-2 text-sm outline-none focus:border-primary"
          />
        </div>
        <select
          value={auteur}
          onChange={(e) => setAuteur(e.target.value)}
          className="h-9 rounded-md border border-border bg-white px-2 text-sm outline-none focus:border-primary"
        >
          <option value="">Toute l&apos;équipe</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nom}
            </option>
          ))}
        </select>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "" | "note" | "echange")}
          className="h-9 rounded-md border border-border bg-white px-2 text-sm outline-none focus:border-primary"
        >
          <option value="">Tout</option>
          <option value="note">Conversation</option>
          <option value="echange">Activité</option>
        </select>
        <span className="text-xs text-muted-foreground">
          {filtres.length} commentaire{filtres.length > 1 ? "s" : ""}
        </span>
      </div>

      {/* Fil */}
      {filtres.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Aucun commentaire pour ces filtres.
        </p>
      ) : (
        <ul className="space-y-2">
          {filtres.map((it) => {
            const m = meta(it.type);
            return (
              <li
                key={it.id}
                className="flex gap-3 rounded-lg border border-border bg-white px-3 py-2.5"
              >
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {initiales(it.auteurNom)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {it.auteurNom}
                    </span>
                    <span>·</span>
                    <span>{tempsRelatif(it.date)}</span>
                    <span>·</span>
                    <Link
                      href={`/leads/${it.leadId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {it.leadNom}
                    </Link>
                    <span
                      className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${m.cls}`}
                    >
                      {m.label}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
                    {it.contenu}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
