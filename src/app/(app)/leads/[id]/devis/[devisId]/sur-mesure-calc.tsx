"use client";

import { useMemo, useRef, useState } from "react";
import { Calculator, X, Plus, Trash2 } from "lucide-react";
import { formatEuros } from "@/lib/format";
import {
  MODELES,
  OPTIONS,
  FACES,
  PRIX_LED,
  PRIX_ECLAIRAGE,
  construireLignes,
  construireLigneUnique,
  prixOption,
  type ConfigSM,
  type Element,
  type Ligne,
} from "./sur-mesure";

const eur = (n: number) => formatEuros(String(Math.round(n * 100) / 100));
const entier = (raw: string) => Math.max(0, Math.trunc(Number(raw) || 0));

type Elem = Element & { key: number };

export function SurMesureCalc({
  descriptions,
  onAjouter,
  onClose,
}: {
  descriptions: Record<string, string>;
  onAjouter: (lignes: Ligne[]) => void;
  onClose: () => void;
}) {
  const [modele, setModele] = useState(MODELES[0].code);
  const [toitL, setToitL] = useState(0);
  const [toitW, setToitW] = useState(0);
  const [toitQte, setToitQte] = useState(0);
  const [poteaux, setPoteaux] = useState(0);
  const [eclairage, setEclairage] = useState(0);

  const [elements, setElements] = useState<Elem[]>([]);
  const keyRef = useRef(0);

  // Ligne d'ajout d'un élément.
  const [optId, setOptId] = useState(OPTIONS[0].id);
  const [face, setFace] = useState(FACES[0]);
  const [addL, setAddL] = useState(0);
  const [addH, setAddH] = useState(0);
  const [addQte, setAddQte] = useState(1);

  const optSel = OPTIONS.find((o) => o.id === optId)!;
  const surfacique = optSel.type !== "unite";
  const apercuPrix = prixOption(optSel, {
    qte: addQte,
    L: surfacique ? addL : 0,
    H: surfacique ? addH : 0,
  });

  function ajouterElement() {
    if (addQte <= 0) return;
    if (surfacique && (addL <= 0 || addH <= 0)) return;
    setElements((e) => [
      ...e,
      {
        key: keyRef.current++,
        optionId: optId,
        face,
        L: surfacique ? addL : 0,
        H: surfacique ? addH : 0,
        qte: addQte,
      },
    ]);
    setAddL(0);
    setAddH(0);
    setAddQte(1);
  }

  // Aperçu détaillé (une ligne par composant) — pour vérifier le calcul.
  // Le devis, lui, ne reçoit qu'UNE seule ligne globale (construireLigneUnique).
  const cfg: ConfigSM = useMemo(
    () => ({ modele, toitL, toitW, toitQte, poteaux, eclairage, elements }),
    [modele, toitL, toitW, toitQte, poteaux, eclairage, elements],
  );
  const apercu = useMemo(
    () => construireLignes(cfg, descriptions),
    [cfg, descriptions],
  );
  const ligneUnique = useMemo(
    () => construireLigneUnique(cfg, descriptions),
    [cfg, descriptions],
  );
  const total = apercu.reduce((a, l) => a + l.prixHt, 0);
  const perimetre = Math.round((toitL + toitW) * 2 * 100) / 100;
  const descriptionUnique = ligneUnique[0]?.description ?? "";

  return (
    <div className="space-y-4 rounded-xl border border-primary/30 bg-primary/[0.03] p-4">
      <div className="flex items-center justify-between">
        <span className="text-eyebrow flex items-center gap-1.5 text-primary">
          <Calculator className="size-4" /> Pergola sur-mesure
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Fermer"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Modèle */}
      <div className="flex flex-wrap gap-1.5">
        {MODELES.map((m) => (
          <button
            key={m.code}
            type="button"
            onClick={() => setModele(m.code)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              modele === m.code
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-white text-foreground hover:border-primary/40"
            }`}
          >
            {m.code}
          </button>
        ))}
      </div>

      {/* Base */}
      <div className="rounded-lg border border-border bg-white p-3">
        <div className="text-eyebrow mb-2 text-muted-foreground">Base (le toit)</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Champ label="Largeur (m)" value={toitL} onChange={setToitL} />
          <Champ label="Avancée (m)" value={toitW} onChange={setToitW} />
          <Champ label="Qté toit" value={toitQte} onChange={setToitQte} />
          <Champ label="Poteaux" value={poteaux} onChange={setPoteaux} />
          <Champ label="Éclairage" value={eclairage} onChange={setEclairage} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          LED auto : périmètre {perimetre} m × {PRIX_LED} € ={" "}
          {eur(perimetre * PRIX_LED)} · Éclairage {PRIX_ECLAIRAGE} €/u
        </p>
      </div>

      {/* Éléments / options avec face */}
      <div className="rounded-lg border border-border bg-white p-3">
        <div className="text-eyebrow mb-2 text-muted-foreground">
          Options — ajouter un élément (précise la face)
        </div>

        {/* En-têtes */}
        <div className="hidden grid-cols-[1fr_9rem_4.5rem_4.5rem_3.5rem_5rem_2rem] gap-2 pb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
          <span>Option</span>
          <span>Face</span>
          <span className="text-right">Largeur (m)</span>
          <span className="text-right">Hauteur (m)</span>
          <span className="text-right">Qté</span>
          <span className="text-right">Prix</span>
          <span />
        </div>

        {/* Ligne d'ajout */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_9rem_4.5rem_4.5rem_3.5rem_5rem_2rem] sm:items-center">
          <select
            value={optId}
            onChange={(e) => setOptId(e.target.value)}
            className="col-span-2 h-9 rounded-md border border-border bg-white px-2 text-sm outline-none focus:border-primary sm:col-span-1"
          >
            {OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={face}
            onChange={(e) => setFace(e.target.value)}
            className="h-9 rounded-md border border-border bg-white px-1 text-sm outline-none focus:border-primary"
            aria-label="Face"
          >
            {FACES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          {surfacique ? (
            <>
              <Mini label="Largeur" value={addL} onChange={setAddL} />
              <Mini label="Hauteur" value={addH} onChange={setAddH} />
            </>
          ) : (
            <>
              <span className="hidden text-center text-xs text-muted-foreground sm:block">—</span>
              <span className="hidden text-center text-xs text-muted-foreground sm:block">—</span>
            </>
          )}
          <Mini label="Qté" value={addQte} onChange={setAddQte} />
          <span className="hidden text-right text-sm tabular-nums text-muted-foreground sm:block">
            {apercuPrix > 0 ? eur(apercuPrix) : "—"}
          </span>
          <button
            type="button"
            onClick={ajouterElement}
            className="flex h-9 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            aria-label="Ajouter l'élément"
          >
            <Plus className="size-4" />
          </button>
        </div>

        {/* Éléments ajoutés */}
        {elements.length > 0 ? (
          <ul className="mt-3 divide-y divide-border border-t border-border">
            {elements.map((el) => {
              const o = OPTIONS.find((x) => x.id === el.optionId)!;
              const p = prixOption(o, { qte: el.qte, L: el.L, H: el.H });
              const dims =
                o.type === "unite"
                  ? `×${el.qte}`
                  : `${el.L}×${el.H} m · ×${el.qte}`;
              return (
                <li key={el.key} className="flex items-center gap-2 py-1.5 text-sm">
                  <span className="flex-1 text-foreground">
                    {o.label}
                    <span className="text-muted-foreground"> · {el.face} · {dims}</span>
                  </span>
                  <span className="tabular-nums text-foreground">{eur(p)}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setElements((e) => e.filter((x) => x.key !== el.key))
                    }
                    className="text-muted-foreground hover:text-red-600"
                    aria-label="Retirer"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            Aucun élément ajouté. Choisis une option, sa face et ses dimensions puis « + ».
          </p>
        )}
      </div>

      {/* Description unifiée (aperçu de la ligne unique du devis) */}
      {descriptionUnique ? (
        <div className="rounded-lg border border-border bg-white p-3">
          <div className="text-eyebrow mb-1.5 text-muted-foreground">
            Description du devis (1 seul produit — modifiable ensuite)
          </div>
          <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-foreground">
            {descriptionUnique}
          </pre>
        </div>
      ) : null}

      {/* Total + action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <span className="text-muted-foreground">Prix global HT : </span>
          <span className="text-lg font-bold tabular-nums text-foreground">
            {eur(total)}
          </span>
          <span className="ml-2 text-xs text-muted-foreground">
            → 1 ligne de devis
          </span>
        </div>
        <button
          type="button"
          onClick={() => onAjouter(ligneUnique)}
          disabled={ligneUnique.length === 0}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Ajouter au devis
        </button>
      </div>
    </div>
  );
}

function Champ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <input
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(e) => onChange(entier(e.target.value))}
        className="h-9 w-full rounded-md border border-border bg-white px-2 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}

function Mini({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      min={0}
      step={1}
      value={value}
      onChange={(e) => onChange(entier(e.target.value))}
      aria-label={label}
      placeholder={label}
      className="h-9 w-full rounded-md border border-border bg-white px-1.5 text-right text-sm outline-none focus:border-primary"
    />
  );
}
