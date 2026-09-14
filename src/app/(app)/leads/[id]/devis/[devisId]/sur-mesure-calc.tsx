"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Calculator, X, Plus, Trash2, Settings2 } from "lucide-react";
import { formatEuros } from "@/lib/format";
import {
  MODELES,
  OPTIONS,
  FACES,
  COULEURS_RAL,
  COULEUR_AUTRE,
  LED_LAMES_LABEL,
  POSES,
  poseDe,
  libellePose,
  PRIX_LED,
  PRIX_ECLAIRAGE,
  construireLignes,
  construireLignesDevis,
  couleurOption,
  modeleDe,
  prixOption,
  type ConfigSM,
  type Element,
  type Ligne,
  type OptionSM,
  type Pose,
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
  options = OPTIONS,
  initial,
  onAjouter,
  onClose,
  catalogue = [],
  onAjouterProduit,
  onNouvellePergola,
  titre = "1 · Configurer la pergola",
  ctaLabel,
}: {
  descriptions: Record<string, string>;
  // Options proposées (table options_configurateur) ; défaut = liste codée.
  options?: OptionSM[];
  initial?: ConfigSM | null;
  onAjouter: (lignes: Ligne[], cfg: ConfigSM) => void;
  onClose?: () => void;
  catalogue?: ProduitCatalogueDTO[];
  onAjouterProduit?: (p: ProduitCatalogueDTO) => void;
  // Ouvre un NOUVEAU configurateur (pergola supplémentaire, config indépendante).
  onNouvellePergola?: () => void;
  titre?: string;
  ctaLabel?: string;
}) {
  // Une pergola a TOUJOURS un toit (qté 1). La POSE se choisit explicitement :
  // adossée (2 poteaux par défaut) ou autoportée (4) ; le nombre de poteaux
  // reste modifiable ensuite.
  const [modele, setModele] = useState(initial?.modele ?? MODELES[0].code);
  const modeleSel = modeleDe(modele);
  const [pose, setPose] = useState<Pose>(initial ? poseDe(initial) : "adossee");
  const [toitL, setToitL] = useState(initial?.toitL ?? 0);
  const [toitW, setToitW] = useState(initial?.toitW ?? 0);
  const [toitQte, setToitQte] = useState(initial?.toitQte ?? 1);
  const [poteaux, setPoteaux] = useState(initial?.poteaux ?? 2);
  const choisirPose = (p: Pose) => {
    setPose(p);
    setPoteaux(POSES.find((x) => x.id === p)?.poteaux ?? 2);
  };
  const [eclairage, setEclairage] = useState(initial?.eclairage ?? 0);

  // Coloris : teinte de la liste (code RAL), « AUTRE » (saisie libre) ou "" =
  // standard. Un supplément HT peut être saisi (0 = option offerte).
  const couleurInit = (initial?.couleur ?? "").trim();
  const ralInit = COULEURS_RAL.find((c) =>
    couleurInit.toUpperCase().startsWith(c.code.toUpperCase()),
  );
  const [couleurSel, setCouleurSel] = useState<string>(
    !couleurInit ? "" : ralInit ? ralInit.code : COULEUR_AUTRE,
  );
  const [couleurLibre, setCouleurLibre] = useState(
    couleurInit && !ralInit ? couleurInit : "",
  );
  const [couleurPrix, setCouleurPrix] = useState(initial?.couleurPrix ?? 0);
  const libelleRal = (sel: string, libre: string): string | null =>
    sel === COULEUR_AUTRE
      ? libre.trim() || null
      : sel
        ? (() => {
            const c = COULEURS_RAL.find((x) => x.code === sel);
            return c ? `${c.code} ${c.nom}` : null;
          })()
        : null;
  const couleur = libelleRal(couleurSel, couleurLibre);

  // Lames : par défaut de la même teinte que la structure ; sinon pergola
  // bicolore (toujours une option, couverte par le même supplément).
  const lamesInit = (initial?.couleurLames ?? "").trim();
  const ralLamesInit = COULEURS_RAL.find((c) =>
    lamesInit.toUpperCase().startsWith(c.code.toUpperCase()),
  );
  const [lamesSel, setLamesSel] = useState<string>(
    !lamesInit ? "" : ralLamesInit ? ralLamesInit.code : COULEUR_AUTRE,
  );
  const [lamesLibre, setLamesLibre] = useState(lamesInit && !ralLamesInit ? lamesInit : "");
  const couleurLames = libelleRal(lamesSel, lamesLibre);
  const optionCouleur = couleurOption({ couleur, couleurLames });
  const couleurStandard = !optionCouleur;

  // Éclairage LED intégré aux lames : mentionné sur le devis ; ligne à part si
  // facturé (supplément HT > 0), sinon « inclus ».
  const [ledLames, setLedLames] = useState(!!initial?.ledLames);
  const [ledLamesPrix, setLedLamesPrix] = useState(initial?.ledLamesPrix ?? 0);

  // Clés initiales = index ; les éléments ajoutés ensuite démarrent au-dessus
  // (1000+) pour éviter toute collision de clé.
  const keyRef = useRef(1000);
  const [elements, setElements] = useState<Elem[]>(
    () => (initial?.elements ?? []).map((e, i) => ({ ...e, key: i })),
  );

  // Ligne d'ajout d'un élément. Les dimensions se SAISISSENT en MILLIMÈTRES
  // (usage métier : « 3350 L × 2500 H ») mais sont stockées en mètres (÷1000)
  // car le moteur de prix travaille en m² — addLmm / addHmm = mm.
  // Options actives + celles (retirées) déjà posées sur cette config, pour
  // que la liste des éléments reste lisible.
  const optionsUtiles = useMemo(() => {
    const actives = options.filter((o) => o.actif !== false);
    const posees = (initial?.elements ?? []).map((e) => e.optionId);
    return [...actives, ...options.filter((o) => o.actif === false && posees.includes(o.id))];
  }, [options, initial]);
  const [optId, setOptId] = useState(optionsUtiles.find((o) => o.actif !== false)?.id ?? optionsUtiles[0]?.id ?? "");
  const [face, setFace] = useState(FACES[0]);
  const [addLmm, setAddLmm] = useState(0);
  const [addHmm, setAddHmm] = useState(0);
  const [addQte, setAddQte] = useState(1);

  const optSel: OptionSM | undefined = optionsUtiles.find((o) => o.id === optId);
  const surfacique = !!optSel && optSel.type !== "unite";
  const apercuPrix = optSel
    ? prixOption(optSel, {
        qte: addQte,
        L: surfacique ? addLmm / 1000 : 0,
        H: surfacique ? addHmm / 1000 : 0,
      })
    : 0;

  function ajouterElement() {
    if (!optSel || addQte <= 0) return;
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
    () => ({
      modele,
      toitL,
      toitW,
      toitQte,
      poteaux,
      eclairage,
      elements,
      couleur,
      couleurPrix: couleurStandard ? 0 : couleurPrix,
      couleurLames,
      ledLames,
      ledLamesPrix: ledLames ? ledLamesPrix : 0,
      pose,
    }),
    [
      modele, toitL, toitW, toitQte, poteaux, eclairage, elements,
      couleur, couleurPrix, couleurStandard, couleurLames, ledLames, ledLamesPrix, pose,
    ],
  );
  const apercu = useMemo(
    () => construireLignes(cfg, descriptions, options),
    [cfg, descriptions, options],
  );
  // Lignes envoyées au devis : le kit pergola + 1 ligne par option (visibles).
  const lignesDevis = useMemo(
    () => construireLignesDevis(cfg, descriptions, options),
    [cfg, descriptions, options],
  );
  const total = apercu.reduce((a, l) => a + l.prixHt, 0);
  const perimetre = Math.round((toitL + toitW) * 2 * 100) / 100;

  return (
    <div className="space-y-4 rounded-xl border border-primary/30 bg-primary/[0.03] p-4">
      <div className="flex items-center justify-between">
        <span className="text-eyebrow flex items-center gap-1.5 text-primary">
          <Calculator className="size-4" /> {titre}
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
        <div className="text-eyebrow mb-2 text-muted-foreground">Structure (toit + poteaux)</div>

        {/* Pose : choix explicite, repris tel quel sur la ligne du devis */}
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">Pose</span>
          {POSES.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => choisirPose(p.id)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                pose === p.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-white text-foreground hover:border-primary/40"
              }`}
              title={`${p.poteaux} poteaux par défaut`}
            >
              {libellePose(p.id, modeleSel)}
              <span className={pose === p.id ? " opacity-80" : " text-muted-foreground"}>
                {" "}· {p.poteaux} poteaux
              </span>
            </button>
          ))}
          <span className="text-xs text-muted-foreground">
            → « {modeleSel.libelle} … — {libellePose(pose, modeleSel)} » sur le devis
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Champ
            label="Largeur (mm)"
            value={Math.round(toitL * 1000)}
            onChange={(v) => setToitL(v / 1000)}
          />
          <Champ
            label="Avancée (mm)"
            value={Math.round(toitW * 1000)}
            onChange={(v) => setToitW(v / 1000)}
          />
          <Champ label="Nb de toits" value={toitQte} onChange={setToitQte} min={1} />
          <Champ label="Nb de poteaux" value={poteaux} onChange={setPoteaux} min={1} />
          {modeleSel.lames ? (
            <Champ label="Spots d'éclairage" value={eclairage} onChange={setEclairage} />
          ) : null}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {toitL > 0 && toitW > 0
            ? `${(toitL * toitW).toFixed(2).replace(".", ",")} m² · `
            : ""}
          {modeleSel.lames ? (
            <>
              Bandeau LED inclus automatiquement sur le périmètre ({perimetre} m ×{" "}
              {PRIX_LED} € = {eur(perimetre * PRIX_LED)}) · spot {PRIX_ECLAIRAGE} €/u
            </>
          ) : (
            <>
              {modeleSel.libelle} : toit {modeleSel.prixToit} € HT/m², poteaux inclus · ni LED ni spots
            </>
          )}
        </p>

        {/* Coloris (option couleur RAL) */}
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 sm:grid-cols-5">
          <label className="col-span-2 block">
            <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
              Couleur de la structure (RAL)
            </span>
            <select
              value={couleurSel}
              onChange={(e) => setCouleurSel(e.target.value)}
              className="mt-0.5 h-9 w-full rounded-md border border-border bg-white px-1 text-sm outline-none focus:border-primary"
            >
              <option value="">Standard — {COULEURS_RAL[0].code} {COULEURS_RAL[0].nom}</option>
              {COULEURS_RAL.filter((c) => !c.standard).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.nom}
                </option>
              ))}
              <option value={COULEUR_AUTRE}>Autre RAL…</option>
            </select>
          </label>
          {couleurSel === COULEUR_AUTRE ? (
            <label className="col-span-2 block">
              <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                Code + nom (ex. RAL 6005 Vert mousse)
              </span>
              <input
                type="text"
                value={couleurLibre}
                onChange={(e) => setCouleurLibre(e.target.value)}
                placeholder="RAL …"
                className="mt-0.5 h-9 w-full rounded-md border border-border bg-white px-2 text-sm outline-none focus:border-primary"
              />
            </label>
          ) : (
            <div className="hidden sm:col-span-2 sm:block" />
          )}
          {!couleurStandard ? (
            <Champ label="Supplément couleur HT (€)" value={couleurPrix} onChange={setCouleurPrix} />
          ) : null}

          {/* Couleur des lames (bicolore) — pergolas bioclimatiques uniquement */}
          {modeleSel.lames ? (
          <label className="col-span-2 block">
            <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
              Couleur des lames
            </span>
            <select
              value={lamesSel}
              onChange={(e) => setLamesSel(e.target.value)}
              className="mt-0.5 h-9 w-full rounded-md border border-border bg-white px-1 text-sm outline-none focus:border-primary"
            >
              <option value="">Identique à la structure</option>
              {COULEURS_RAL.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.nom}
                </option>
              ))}
              <option value={COULEUR_AUTRE}>Autre RAL…</option>
            </select>
          </label>
          ) : null}
          {modeleSel.lames && lamesSel === COULEUR_AUTRE ? (
            <label className="col-span-2 block">
              <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                Code + nom des lames
              </span>
              <input
                type="text"
                value={lamesLibre}
                onChange={(e) => setLamesLibre(e.target.value)}
                placeholder="RAL …"
                className="mt-0.5 h-9 w-full rounded-md border border-border bg-white px-2 text-sm outline-none focus:border-primary"
              />
            </label>
          ) : (
            <div className="hidden sm:col-span-2 sm:block" />
          )}
          <div className="hidden sm:block" />
        </div>
        {!couleurStandard ? (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Ligne « Option couleur — {optionCouleur ?? "…"} » ajoutée au devis
            {couleurPrix > 0 ? ` : ${eur(couleurPrix)} HT` : " : offerte (0 €)"}.
          </p>
        ) : null}

        {/* Éclairage LED intégré aux lames — pergolas bioclimatiques uniquement */}
        {modeleSel.lames ? (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 sm:grid-cols-5">
          <label className="col-span-2 flex h-9 items-center gap-2 text-sm text-foreground sm:col-span-4">
            <input
              type="checkbox"
              checked={ledLames}
              onChange={(e) => setLedLames(e.target.checked)}
              className="size-4 accent-primary"
            />
            {LED_LAMES_LABEL}
            <span className="text-xs text-muted-foreground">
              {ledLames
                ? ledLamesPrix > 0
                  ? `— ligne « ${LED_LAMES_LABEL} » à ${eur(ledLamesPrix)} HT`
                  : "— inclus (rappelé dans la description, pas de ligne)"
                : "— non mentionné sur le devis"}
            </span>
          </label>
          {ledLames ? (
            <Champ label="Supplément LED lames HT (€)" value={ledLamesPrix} onChange={setLedLamesPrix} />
          ) : null}
        </div>
        ) : null}
      </div>

      {/* Éléments / options avec face */}
      <div className="rounded-lg border border-border bg-white p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-eyebrow text-muted-foreground">
            Options de la pergola — clique une option, précise la face et les dimensions
          </span>
          <Link
            href="/reglages/options"
            target="_blank"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:underline"
            title="Ajouter, retirer ou modifier le prix des options proposées ici (pour toute l'équipe)"
          >
            <Settings2 className="size-3.5" /> Gérer les options ↗
          </Link>
        </div>

        {/* Vignettes d'options dimensionnées */}
        {optionsUtiles.filter((o) => o.actif !== false).length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
            Aucune option active. Ajoute-en dans « Gérer les options ».
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {optionsUtiles.filter((o) => o.actif !== false).map((o) => {
            const sel = o.id === optId;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  setOptId(o.id);
                  if (o.type !== "unite") {
                    if (addLmm <= 0 && o.defL) setAddLmm(Math.round(o.defL * 1000));
                    if (addHmm <= 0 && o.defH) setAddHmm(Math.round(o.defH * 1000));
                  }
                }}
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
            disabled={!optSel}
            className="flex h-9 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            aria-label="Ajouter l'élément"
          >
            <Plus className="size-4" />
          </button>
        </div>

        {/* Éléments ajoutés */}
        {elements.length > 0 ? (
          <ul className="mt-3 divide-y divide-border border-t border-border">
            {elements.map((el) => {
              const o = options.find((x) => x.id === el.optionId);
              const p = o ? prixOption(o, { qte: el.qte, L: el.L, H: el.H }) : 0;
              const dims =
                !o || o.type === "unite"
                  ? `×${el.qte}`
                  : `${Math.round(el.L * 1000)} L × ${Math.round(el.H * 1000)} H mm · ×${el.qte}`;
              return (
                <li key={el.key} className="flex items-center gap-2 py-1.5 text-sm">
                  <span className="flex-1 text-foreground">
                    {o?.label ?? `Option retirée (${el.optionId})`}
                    {o && o.actif === false ? (
                      <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-bold uppercase text-amber-700">retirée</span>
                    ) : null}
                    <span className="text-muted-foreground"> · {el.face} · {dims}</span>
                  </span>
                  <span className="tabular-nums text-foreground">{o ? eur(p) : "—"}</span>
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
          <span className="text-muted-foreground">Sous-total {modeleSel.lames ? "pergola" : modeleSel.libelle.toLowerCase()} : </span>
          <span className="text-lg font-bold tabular-nums text-foreground">
            {eur(total)}
          </span>
          <span className="ml-2 text-xs text-muted-foreground">
            → {lignesDevis.length} ligne{lignesDevis.length > 1 ? "s" : ""} de devis
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onNouvellePergola ? (
            <button
              type="button"
              onClick={onNouvellePergola}
              className="inline-flex items-center gap-1.5 rounded-md border border-primary px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary/10"
              title="Ouvre un 2ᵉ configurateur pour une pergola avec une configuration différente"
            >
              <Plus className="size-4" /> Ajouter une 2ᵉ pergola
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onAjouter(lignesDevis, cfg)}
            disabled={lignesDevis.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {ctaLabel ?? (initial ? "Mettre à jour la pergola" : "Ajouter au devis")}
          </button>
        </div>
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
