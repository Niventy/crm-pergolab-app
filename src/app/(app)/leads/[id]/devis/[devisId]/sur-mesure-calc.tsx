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
  construireLignesDevis,
  prixOption,
  type ConfigSM,
  type Element,
  type Ligne,
  type OptionSM,
} from "./sur-mesure";
import type { ProduitCatalogueDTO } from "@/app/(app)/reglages/actions";

const eur = (n: number) => formatEuros(String(Math.round(n * 100) / 100));
const entier = (raw: string) => Math.max(0, Math.trunc(Number(raw) || 0));

// Indication de prix affichée sur la vignette d'une option (selon son mode).
function indicPrix(o: OptionSM): string {
  if (o.type === "unite") return `${eur(o.prix)}/u`;
  if (o.type === "surface_forfait")
    return `${eur(o.prix)}/m² + ${eur(o.forfait ?? 0)}`;
  return `${eur(o.prix)}/m²`;
}

type Elem = Element & { key: number };

export function SurMesureCalc({
  descriptions,
  initial,
  onAjouter,
  onClose,
  catalogue = [],
  onAjouterProduit,
}: {
  descriptions: Record<string, string>;
  initial?: ConfigSM | null;
  onAjouter: (lignes: Ligne[], cfg: ConfigSM) => void;
  onClose?: () => void;
  catalogue?: ProduitCatalogueDTO[];
  onAjouterProduit?: (p: ProduitCatalogueDTO) => void;
}) {
  // Une pergola a TOUJOURS un toit (qté 1). Poteaux : 4 par défaut (autoportée),
  // mais minimum 2 car les pergolas adossées à l'existant n'en ont que 2.
  const [modele, setModele] = useState(initial?.modele ?? MODELES[0].code);
  const [toitL, setToitL] = useState(initial?.toitL ?? 0);
  const [toitW, setToitW] = useState(initial?.toitW ?? 0);
  const [toitQte, setToitQte] = useState(initial?.toitQte ?? 1);
  const [poteaux, setPoteaux] = useState(initial?.poteaux ?? 4);
  const [eclairage, setEclairage] = useState(initial?.eclairage ?? 0);

  // Clés initiales = index ; les éléments ajoutés ensuite démarrent au-dessus
  // (1000+) pour éviter toute collision de clé.
  const keyRef = useRef(1000);
  const [elements, setElements] = useState<Elem[]>(
    () => (initial?.elements ?? []).map((e, i) => ({ ...e, key: i })),
  );

  // Ligne d'ajout d'un élément. Les dimensions se SAISISSENT en MILLIMÈTRES
  // (usage métier : « 3350 L × 2500 H ») mais sont stockées en mètres (÷1000)
  // car le moteur de prix travaille en m² — addLmm / addHmm = mm.
  const [optId, setOptId] = useState(OPTIONS[0].id);
  const [face, setFace] = useState(FACES[0]);
  const [addLmm, setAddLmm] = useState(0);
  const [addHmm, setAddHmm] = useState(0);
  const [addQte, setAddQte] = useState(1);

  const optSel = OPTIONS.find((o) => o.id === optId)!;
  const surfacique = optSel.type !== "unite";
  const apercuPrix = prixOption(optSel, {
    qte: addQte,
    L: surfacique ? addLmm / 1000 : 0,
    H: surfacique ? addHmm / 1000 : 0,
  });

  function ajouterElement() {
    if (addQte <= 0) return;
    if (surfacique && (addLmm <= 0 || addHmm <= 0)) return;
    setElements((e) => [
      ...e,
      {
        key: keyRef.current++,
        optionId: optId,
        face,
        L: surfacique ? addLmm / 1000 : 0,
        H: surfacique ? addHmm / 1000 : 0,
        qte: addQte,
      },
    ]);
    setAddLmm(0);
    setAddHmm(0);
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
  // Lignes envoyées au devis : le kit pergola + 1 ligne par option (visibles).
  const lignesDevis = useMemo(
    () => construireLignesDevis(cfg, descriptions),
    [cfg, descriptions],
  );
  const total = apercu.reduce((a, l) => a + l.prixHt, 0);
  const perimetre = Math.round((toitL + toitW) * 2 * 100) / 100;

  return (
    <div className="space-y-4 rounded-xl border border-primary/30 bg-primary/[0.03] p-4">
      <div className="flex items-center justify-between">
        <span className="text-eyebrow flex items-center gap-1.5 text-primary">
          <Calculator className="size-4" /> 1 · Configurer la pergola
        </span>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Fermer"
          >
            <X className="size-4" />
          </button>
        ) : null}
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
          <Champ label="Qté toit" value={toitQte} onChange={setToitQte} min={1} />
          <Champ label="Poteaux" value={poteaux} onChange={setPoteaux} min={2} />
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
          Options de la pergola — clique une option, précise la face et les dimensions
        </div>

        {/* Vignettes d'options dimensionnées */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {OPTIONS.map((o) => {
            const sel = o.id === optId;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setOptId(o.id)}
                className={`flex flex-col items-start gap-0.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                  sel
                    ? "border-primary bg-primary/10 ring-1 ring-primary"
                    : "border-border bg-white hover:border-primary/40 hover:bg-primary/5"
                }`}
              >
                <span className="text-sm font-medium leading-tight text-foreground">
                  {o.label}
                </span>
                <span className="text-[0.7rem] text-muted-foreground">
                  {indicPrix(o)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Paramètres de l'option choisie */}
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/30 p-2.5 sm:grid-cols-[9rem_5rem_5rem_3.5rem_6rem_2.25rem] sm:items-end">
          <label className="col-span-2 sm:col-span-1">
            <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
              Face
            </span>
            <select
              value={face}
              onChange={(e) => setFace(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-white px-1 text-sm outline-none focus:border-primary"
            >
              {FACES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          {surfacique ? (
            <>
              <label className="block">
                <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                  Longueur (mm)
                </span>
                <Mini label="Longueur (mm)" value={addLmm} onChange={setAddLmm} />
              </label>
              <label className="block">
                <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                  Hauteur (mm)
                </span>
                <Mini label="Hauteur (mm)" value={addHmm} onChange={setAddHmm} />
              </label>
            </>
          ) : (
            <>
              <div className="hidden text-center sm:block">
                <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                  Longueur
                </span>
                <div className="h-9 pt-2 text-xs text-muted-foreground">—</div>
              </div>
              <div className="hidden text-center sm:block">
                <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                  Hauteur
                </span>
                <div className="h-9 pt-2 text-xs text-muted-foreground">—</div>
              </div>
            </>
          )}
          <label className="block">
            <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
              Qté
            </span>
            <Mini label="Qté" value={addQte} onChange={setAddQte} />
          </label>
          <div className="text-right text-sm">
            <div className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
              Prix
            </div>
            <div className="tabular-nums text-foreground">
              {apercuPrix > 0 ? eur(apercuPrix) : "—"}
            </div>
          </div>
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
                  : `${Math.round(el.L * 1000)} L × ${Math.round(el.H * 1000)} H mm · ×${el.qte}`;
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

        {/* Produits & forfaits (menuiserie, énergie, forfaits) : ajout direct */}
        {catalogue.length > 0 && onAjouterProduit ? (
          <div className="mt-3 border-t border-border pt-3">
            <div className="text-eyebrow mb-2 text-muted-foreground">
              Produits &amp; forfaits — clique pour ajouter au devis
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {catalogue.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onAjouterProduit(p)}
                  className="flex flex-col items-start gap-0.5 rounded-lg border border-border bg-white px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <span className="text-sm font-medium leading-tight text-foreground">
                    {p.nom}
                  </span>
                  <span className="text-[0.7rem] text-muted-foreground">
                    {p.categorie ? `${p.categorie} · ` : ""}
                    {p.prixHt > 0 ? eur(p.prixHt) : "prix à définir"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Aperçu des lignes envoyées au devis (kit + options) */}
      {lignesDevis.length > 0 ? (
        <div className="rounded-lg border border-border bg-white p-3">
          <div className="text-eyebrow mb-1.5 text-muted-foreground">
            Aperçu des lignes à ajouter
          </div>
          <ul className="divide-y divide-border">
            {lignesDevis.map((l, i) => (
              <li key={i} className="flex items-center gap-2 py-1 text-sm">
                <span className="flex-1 text-foreground">{l.designation}</span>
                <span className="tabular-nums text-muted-foreground">
                  {eur(l.prixHt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Total + action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <span className="text-muted-foreground">Sous-total pergola : </span>
          <span className="text-lg font-bold tabular-nums text-foreground">
            {eur(total)}
          </span>
          <span className="ml-2 text-xs text-muted-foreground">
            → {lignesDevis.length} ligne{lignesDevis.length > 1 ? "s" : ""} de devis
          </span>
        </div>
        <button
          type="button"
          onClick={() => onAjouter(lignesDevis, cfg)}
          disabled={lignesDevis.length === 0}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {initial ? "Mettre à jour la pergola" : "Ajouter au devis"}
        </button>
      </div>
    </div>
  );
}

function Champ({
  label,
  value,
  onChange,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  return (
    <label className="block">
      <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <input
        type="number"
        min={min}
        step={1}
        value={value}
        onChange={(e) => onChange(Math.max(min, entier(e.target.value)))}
        className="h-9 w-full rounded-md border border-border bg-white px-2 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}

function Mini({
  label,
  value,
  onChange,
  dec = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  dec?: boolean; // autorise les décimales (dimensions en m, ex. 4,76)
}) {
  return (
    <input
      type="number"
      min={0}
      step={dec ? 0.01 : 1}
      value={value}
      onChange={(e) =>
        onChange(dec ? Math.max(0, Number(e.target.value) || 0) : entier(e.target.value))
      }
      aria-label={label}
      placeholder={label}
      className="h-9 w-full rounded-md border border-border bg-white px-1.5 text-right text-sm outline-none focus:border-primary"
    />
  );
}
