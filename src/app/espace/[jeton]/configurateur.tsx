"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { reduireImage } from "@/lib/reduire-image";
import { Camera, Check, CircleOff, FileText, Home, Loader2, Minus, Plus } from "lucide-react";
import {
  COULEURS_RAL,
  libellePose,
  MODELES,
  modeleDe,
  type OptionSM,
  type Pose,
} from "@/app/(app)/leads/[id]/devis/[devisId]/sur-mesure";
import {
  COTE_LABEL,
  COTES,
  estFermeture,
  OUVERTURES,
  SOLS,
  type ConfigClient,
  type Cote,
  type DetailsClient,
} from "@/lib/schema-production";

// Configurateur de l'espace client : le client RECONFIGURE sa pergola (même
// logique que le configurateur de pergolab.fr) pour valider son schéma de
// production. Pré-rempli depuis le devis signé + le métré ; aucun prix affiché ;
// les écarts avec le devis sont signalés à l'équipe à l'envoi.

export type OptionClient = Pick<OptionSM, "id" | "label" | "type">;

const TEINTES: Record<string, string> = {
  "RAL 7016": "#383e42",
  "RAL 9010": "#f1ece1",
  "RAL 9005": "#0e0e10",
  "RAL 9006": "#a1a1a0",
  "RAL 7035": "#cbd0cc",
  "RAL 1015": "#e6d2b5",
  "RAL 6003": "#4a5b3f",
  "RAL 3004": "#6b1c23",
  "RAL 5003": "#1f3855",
};
const teinte = (c: string | null) => {
  const k = Object.keys(TEINTES).find((x) => c?.toUpperCase().startsWith(x));
  return k ? TEINTES[k] : "#64748b";
};
const RAL = COULEURS_RAL.map((c) => `${c.code} ${c.nom}`);
const DESCRIPTION_MODELE: Record<string, string> = {
  ESSENTIA: "Lames orientables",
  HORIZON: "Lames orientables, motorisée",
  SIGNATURE: "Grandes portées, haut de gamme",
  CARPORT: "Toit plein pour abriter un véhicule",
};

export function Configurateur({
  jeton,
  initiale,
  options,
  documents,
  conseiller,
  photosActives,
}: {
  jeton: string;
  initiale: ConfigClient;
  options: OptionClient[];
  documents: { id: string; nom: string }[];
  conseiller: string | null;
  photosActives: boolean;
}) {
  const router = useRouter();
  const [c, setC] = useState<ConfigClient>(initiale);
  const [details, setDetails] = useState<DetailsClient>({
    coteMaison: initiale.pose === "adossee" ? "back" : null,
    ouvertureLames: null,
    sol: null,
    solPrecision: null,
    hauteurDispoMm: null,
    photos: [],
  });
  const [coteOuvert, setCoteOuvert] = useState<Cote | null>(null);
  const [autreCouleur, setAutreCouleur] = useState(!RAL.includes(initiale.couleur));
  const [photos, setPhotos] = useState<{ id: string; apercu: string }[]>([]);
  const [envoiPhoto, setEnvoiPhoto] = useState(false);
  const [accord, setAccord] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const modele = modeleDe(c.modele);
  const fermetures = useMemo(() => options.filter((o) => estFermeture(o as OptionSM)), [options]);
  const equipements = useMemo(() => options.filter((o) => !estFermeture(o as OptionSM)), [options]);
  const nom = (id: string | null) => options.find((o) => o.id === id)?.label ?? null;
  const set = <K extends keyof ConfigClient>(k: K, v: ConfigClient[K]) => setC((x) => ({ ...x, [k]: v }));
  const setD = <K extends keyof DetailsClient>(k: K, v: DetailsClient[K]) => setDetails((d) => ({ ...d, [k]: v }));

  const coteMaison = c.pose === "adossee" ? details.coteMaison : null;
  const manque = [
    !c.largeurMm || c.largeurMm < 1000 ? "la largeur" : null,
    !c.avanceeMm || c.avanceeMm < 1000 ? "l'avancée" : null,
    c.pose === "adossee" && !details.coteMaison ? "le côté de votre maison" : null,
    modele.lames && !details.ouvertureLames ? "le sens d'ouverture des lames" : null,
    !details.sol ? "le type de sol" : null,
  ].filter((x): x is string => !!x);

  function choisirPose(p: Pose) {
    set("pose", p);
    setD("coteMaison", p === "adossee" ? (details.coteMaison ?? "back") : null);
  }
  function choisirCoteMaison(cote: Cote) {
    setD("coteMaison", cote);
    // Pas de fermeture contre le mur de la maison.
    setC((x) => ({ ...x, fermetures: { ...x.fermetures, [cote]: null } }));
  }
  function qte(id: string, delta: number) {
    setC((x) => {
      const cur = x.equipements.find((e) => e.optionId === id)?.qte ?? 0;
      const n = Math.max(0, Math.min(20, cur + delta));
      const autres = x.equipements.filter((e) => e.optionId !== id);
      return { ...x, equipements: n ? [...autres, { optionId: id, qte: n }] : autres };
    });
  }

  async function ajouterPhotos(files: FileList | null) {
    if (!files?.length) return;
    setEnvoiPhoto(true);
    setErreur(null);
    for (const f of Array.from(files).slice(0, 10)) {
      try {
        const blob = await reduireImage(f);
        const fd = new FormData();
        fd.append("file", blob, f.name.replace(/\.\w+$/, "") + ".jpg");
        const res = await fetch(`/espace/${jeton}/photo`, { method: "POST", body: fd });
        const j = (await res.json().catch(() => null)) as { ok?: boolean; id?: string; error?: string } | null;
        if (!res.ok || !j?.ok || !j.id) {
          setErreur(j?.error ?? "L'envoi d'une photo a échoué.");
          continue;
        }
        const id = j.id;
        setPhotos((p) => [...p, { id, apercu: URL.createObjectURL(blob) }]);
        setDetails((d) => ({ ...d, photos: [...d.photos, id] }));
      } catch {
        setErreur("Cette photo n'a pas pu être lue. Essayez une capture JPG.");
      }
    }
    setEnvoiPhoto(false);
  }

  async function envoyer() {
    setEnvoi(true);
    setErreur(null);
    try {
      const res = await fetch(`/espace/${jeton}/validation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: c, details, accord }),
      });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !j?.ok) {
        setErreur(j?.error ?? "L'envoi a échoué, réessayez dans un instant.");
        setEnvoi(false);
        return;
      }
      router.refresh();
    } catch {
      setErreur("Connexion impossible, réessayez dans un instant.");
      setEnvoi(false);
    }
  }

  return (
    <div className="space-y-6">
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
        Votre configuration est pré-remplie d&apos;après votre devis signé. Vérifiez et ajustez chaque
        élément : toute modification sera vérifiée par {conseiller ?? "votre conseiller"} avant la
        fabrication (elle peut modifier le prix).
      </p>

      <div className="rounded-xl bg-slate-50 p-3">
        <SchemaSVG config={c} coteMaison={coteMaison} nom={nom} />
      </div>

      {/* 1 · Modèle */}
      <Etape n={1} titre="Modèle">
        <div className="grid grid-cols-2 gap-2">
          {MODELES.map((m) => (
            <Carte key={m.code} actif={c.modele === m.code} onClick={() => set("modele", m.code)}>
              <span className="block text-sm font-bold">{m.libelle}</span>
              <span className="block text-xs text-muted-foreground">{DESCRIPTION_MODELE[m.code] ?? ""}</span>
            </Carte>
          ))}
        </div>
      </Etape>

      {/* 2 · Pose */}
      <Etape n={2} titre="Type de pose">
        <div className="grid grid-cols-2 gap-2">
          {(["adossee", "autoportee"] as Pose[]).map((p) => (
            <Carte key={p} actif={c.pose === p} onClick={() => choisirPose(p)}>
              <span className="block text-sm font-bold">{libellePose(p, modele)}</span>
              <span className="block text-xs text-muted-foreground">
                {p === "adossee" ? "Fixée au mur de la maison, 2 poteaux" : "Indépendante, 4 poteaux"}
              </span>
            </Carte>
          ))}
        </div>
        {c.pose === "adossee" ? (
          <Question label="De quel côté se trouve le mur de votre maison ?" aide="Vu depuis le jardin, face à la pergola.">
            <Puces
              options={COTES.map((x) => ({ id: x, label: COTE_LABEL[x] }))}
              valeur={details.coteMaison}
              onChange={(v) => choisirCoteMaison(v as Cote)}
            />
          </Question>
        ) : null}
      </Etape>

      {/* 3 · Dimensions */}
      <Etape n={3} titre="Dimensions (en millimètres)">
        <div className="grid grid-cols-3 gap-2">
          <ChampMm label="Largeur" valeur={c.largeurMm} onChange={(v) => set("largeurMm", v)} />
          <ChampMm label="Avancée" valeur={c.avanceeMm} onChange={(v) => set("avanceeMm", v)} />
          <ChampMm label="Hauteur" aide="facultatif" valeur={c.hauteurMm} onChange={(v) => set("hauteurMm", v)} />
        </div>
        <p className="text-xs text-muted-foreground">
          Largeur = côté avant ; avancée = profondeur depuis la maison. Hors tout, poteaux compris.
        </p>
      </Etape>

      {/* 4 · Coloris */}
      <Etape n={4} titre="Coloris">
        <Question label="Couleur de la structure">
          <div className="flex flex-wrap gap-2">
            {RAL.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setAutreCouleur(false);
                  set("couleur", r);
                }}
                title={r}
                className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs ${
                  !autreCouleur && c.couleur === r ? "border-primary ring-2 ring-primary/30" : "border-border bg-white"
                }`}
              >
                <span className="size-4 rounded-full border border-black/10" style={{ background: teinte(r) }} />
                {r}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setAutreCouleur(true)}
              className={`rounded-full border px-3 py-1 text-xs ${autreCouleur ? "border-primary ring-2 ring-primary/30" : "border-border bg-white"}`}
            >
              Autre RAL…
            </button>
          </div>
          {autreCouleur ? (
            <input
              value={RAL.includes(c.couleur) ? "" : c.couleur}
              maxLength={80}
              onChange={(e) => set("couleur", e.target.value)}
              placeholder="ex. RAL 7022 Gris terre d'ombre"
              className="mt-2 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
            />
          ) : null}
        </Question>
        {modele.lames ? (
          <>
            <Question label="Couleur des lames">
              <select
                value={c.couleurLames ?? ""}
                onChange={(e) => set("couleurLames", e.target.value || null)}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
              >
                <option value="">Identique à la structure</option>
                {RAL.filter((r) => r !== c.couleur).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Question>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={c.ledLames}
                onChange={(e) => set("ledLames", e.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
              Éclairage LED intégré aux lames
            </label>
          </>
        ) : null}
      </Etape>

      {/* 5 · Fermetures */}
      <Etape n={5} titre="Fermetures par côté">
        <p className="text-xs text-muted-foreground">Touchez un côté pour choisir sa fermeture.</p>
        <div className="grid grid-cols-2 gap-2">
          {COTES.map((x) => {
            const maison = coteMaison === x;
            const f = nom(c.fermetures[x]);
            const dim = x === "front" || x === "back" ? c.largeurMm : c.avanceeMm;
            return (
              <button
                key={x}
                type="button"
                disabled={maison}
                onClick={() => setCoteOuvert(coteOuvert === x ? null : x)}
                className={`rounded-lg border p-2.5 text-left text-xs ${
                  maison
                    ? "border-amber-300 bg-amber-50"
                    : coteOuvert === x
                      ? "border-primary ring-2 ring-primary/30"
                      : f
                        ? "border-primary/40 bg-primary/5"
                        : "border-border bg-white hover:bg-muted"
                }`}
              >
                <span className="block font-bold uppercase tracking-wider text-muted-foreground">
                  {COTE_LABEL[x]}
                  <span className="font-normal normal-case tracking-normal">
                    {dim ? ` · ${dim.toLocaleString("fr-FR")} mm` : ""}
                  </span>
                </span>
                {maison ? (
                  <span className="mt-1 flex items-center gap-1 font-semibold text-amber-900">
                    <Home className="size-3.5" /> Mur de la maison
                  </span>
                ) : (
                  <span className={`mt-1 block ${f ? "font-semibold" : "text-muted-foreground"}`}>{f ?? "Ouvert"}</span>
                )}
              </button>
            );
          })}
        </div>
        {coteOuvert ? (
          <div className="space-y-1.5 rounded-lg border border-border bg-white p-2">
            <p className="px-1 text-xs font-semibold">Côté {COTE_LABEL[coteOuvert].toLowerCase()}</p>
            {[{ id: null as string | null, label: "Aucune fermeture (ouvert)" }, ...fermetures].map((o) => {
              const actif = c.fermetures[coteOuvert] === o.id;
              return (
                <button
                  key={o.id ?? "aucune"}
                  type="button"
                  onClick={() => {
                    setC((x) => ({ ...x, fermetures: { ...x.fermetures, [coteOuvert]: o.id } }));
                    setCoteOuvert(null);
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${
                    actif ? "bg-primary/10 font-semibold" : "hover:bg-muted"
                  }`}
                >
                  {o.id ? <span className="size-3 rounded-sm bg-primary/60" /> : <CircleOff className="size-3.5 text-muted-foreground" />}
                  <span className="flex-1">{o.label}</span>
                  {actif ? <Check className="size-4 text-primary" /> : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </Etape>

      {/* 6 · Équipements */}
      {equipements.length ? (
        <Etape n={6} titre="Équipements">
          <div className="divide-y divide-border rounded-lg border border-border bg-white">
            {equipements.map((o) => {
              const n = c.equipements.find((e) => e.optionId === o.id)?.qte ?? 0;
              return (
                <div key={o.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className={`flex-1 ${n ? "font-semibold" : ""}`}>{o.label}</span>
                  <button
                    type="button"
                    onClick={() => qte(o.id, -1)}
                    disabled={!n}
                    aria-label={`Retirer ${o.label}`}
                    className="flex size-7 items-center justify-center rounded-full border border-border disabled:opacity-30"
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <span className="w-4 text-center tabular-nums">{n}</span>
                  <button
                    type="button"
                    onClick={() => qte(o.id, 1)}
                    aria-label={`Ajouter ${o.label}`}
                    className="flex size-7 items-center justify-center rounded-full border border-border"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </Etape>
      ) : null}

      {/* 7 · Précisions de pose */}
      <Etape n={equipements.length ? 7 : 6} titre="Précisions pour la pose">
        {modele.lames ? (
          <Question
            label="Vers où les lames doivent-elles s'ouvrir ?"
            aide="Côté vers lequel l'eau s'écoule et la lumière entre quand les lames sont entrouvertes."
          >
            <Puces
              options={OUVERTURES.map((o) => ({ id: o.id, label: o.label }))}
              valeur={details.ouvertureLames}
              onChange={(v) => setD("ouvertureLames", v as DetailsClient["ouvertureLames"])}
            />
          </Question>
        ) : null}
        <Question label="Sur quel sol sera posée la pergola ?" aide="Pour prévoir la fixation des poteaux.">
          <Puces
            options={SOLS.map((s) => ({ id: s.id, label: s.label }))}
            valeur={details.sol}
            onChange={(v) => setD("sol", v as DetailsClient["sol"])}
          />
          <input
            value={details.solPrecision ?? ""}
            maxLength={500}
            onChange={(e) => setD("solPrecision", e.target.value || null)}
            placeholder="Précision (épaisseur de la dalle, pente, marches…) — facultatif"
            className="mt-2 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </Question>
        <Question
          label="Hauteur disponible (facultatif)"
          aide="Sous la gouttière, un volet roulant ou une fenêtre, à l'endroit le plus bas."
        >
          <ChampMm label="" valeur={details.hauteurDispoMm} onChange={(v) => setD("hauteurDispoMm", v)} />
        </Question>
        <Question label="Photos de l'emplacement (facultatif)" aide="Le mur, le sol et les accès.">
          {photosActives ? (
            <div className="flex flex-wrap gap-2">
              {photos.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob:)
                <img key={p.id} src={p.apercu} alt="" className="size-20 rounded-lg border border-border object-cover" />
              ))}
              <label className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-white text-[11px] text-muted-foreground hover:bg-muted">
                {envoiPhoto ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
                Ajouter
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  disabled={envoiPhoto}
                  onChange={(e) => {
                    void ajouterPhotos(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Vous pouvez envoyer vos photos à {conseiller ?? "votre conseiller"} par email ou par SMS.
            </p>
          )}
        </Question>
      </Etape>

      {documents.length ? (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">Documents techniques à consulter</p>
          {documents.map((d) => (
            <a
              key={d.id}
              href={`/espace/${jeton}/document/${d.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
            >
              <FileText className="size-4" /> {d.nom}
            </a>
          ))}
        </div>
      ) : null}

      {/* Validation */}
      <section className="space-y-3 border-t border-border pt-4">
        <label className="flex items-start gap-2 rounded-xl border border-border bg-white p-3 text-sm">
          <input
            type="checkbox"
            checked={accord}
            onChange={(e) => setAccord(e.target.checked)}
            className="mt-0.5 size-4 accent-[var(--primary)]"
          />
          <span>
            Je confirme que cette configuration correspond à ma pergola (modèle, dimensions, pose,
            coloris, fermetures, équipements{documents.length ? ", documents techniques" : ""}) et je
            demande le lancement de la fabrication après vérification par Pergolab.
          </span>
        </label>
        {manque.length ? <p className="text-sm text-amber-700">Précisez encore {manque.join(", ")}.</p> : null}
        {erreur ? <p className="text-sm font-medium text-red-700">{erreur}</p> : null}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={envoyer}
            disabled={envoi || envoiPhoto || !!manque.length || !accord}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            {envoi ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Valider mon schéma de production
          </button>
        </div>
      </section>
    </div>
  );
}

// ── Vue 3D (même perspective que le configurateur de pergolab.fr) ─────────────
const MURS: Record<Cote, string> = {
  front: "M60,42 L170,32 L170,88 L60,98 Z",
  back: "M40,20 L150,10 L150,66 L40,76 Z",
  left: "M40,20 L60,42 L60,98 L40,76 Z",
  right: "M150,10 L170,32 L170,88 L150,66 Z",
};
const MAISON: Record<Cote, string> = {
  front: "M60,30 L170,20 L170,98 L60,108 Z",
  back: "M40,4 L150,-6 L150,66 L40,76 Z",
  left: "M40,6 L60,28 L60,98 L40,76 Z",
  right: "M150,-4 L170,18 L170,88 L150,66 Z",
};
const POTEAUX: [number, number][] = [
  [38, 20],
  [58, 42],
  [148, 10],
  [168, 32],
];
const ANGLES_DU_COTE: Record<Cote, number[]> = { front: [1, 3], back: [0, 2], left: [0, 1], right: [2, 3] };

export function SchemaSVG({
  config,
  coteMaison,
  nom,
}: {
  config: ConfigClient;
  coteMaison: Cote | null;
  nom: (id: string | null) => string | null;
}) {
  const modele = modeleDe(config.modele);
  const sansPoteau = new Set(coteMaison ? ANGLES_DU_COTE[coteMaison] : []);
  const couleur = teinte(config.couleur);
  const mm = (v: number | null) => (v ? `${v.toLocaleString("fr-FR")} mm` : "—");
  const maisonDevant = coteMaison === "front" || coteMaison === "right";
  const maison = coteMaison ? (
    <path d={MAISON[coteMaison]} fill="url(#briques)" stroke="#b45309" strokeWidth="1" opacity={maisonDevant ? 0.55 : 1} />
  ) : null;
  return (
    <svg viewBox="0 -10 222 128" className="mx-auto w-full max-w-md" role="img" aria-label={`Schéma : ${modele.libelle}`}>
      <defs>
        <pattern id="briques" width="8" height="5" patternUnits="userSpaceOnUse">
          <rect width="8" height="5" fill="#fde7c7" />
          <path d="M0 0H8M0 2.5H8M2 0V2.5M6 2.5V5" stroke="#e8b97a" strokeWidth="0.5" />
        </pattern>
      </defs>
      {!maisonDevant ? maison : null}
      {COTES.filter((x) => x !== coteMaison).map((x) => {
        const ferme = !!config.fermetures[x];
        return (
          <path
            key={x}
            d={MURS[x]}
            fill={ferme ? "rgba(30,58,47,0.28)" : "rgba(148,163,184,0.06)"}
            stroke={ferme ? "#1e3a2f" : "#cbd5e1"}
            strokeWidth={ferme ? 1.6 : 0.8}
            strokeDasharray={ferme ? undefined : "4 3"}
          >
            <title>{`${COTE_LABEL[x]} : ${nom(config.fermetures[x]) ?? "ouvert"}`}</title>
          </path>
        );
      })}
      <path
        d="M40,20 L150,10 L170,32 L60,42 Z"
        fill={modele.lames ? "#e2e8f0" : "#cbd5e1"}
        stroke={couleur}
        strokeWidth="2"
      />
      {modele.lames
        ? Array.from({ length: 9 }, (_, i) => {
            const t = (i + 1) / 10;
            return (
              <line
                key={i}
                x1={40 + 20 * t}
                y1={20 + 22 * t}
                x2={150 + 20 * t}
                y2={10 + 22 * t}
                stroke={config.ledLames ? "#facc15" : "#94a3b8"}
                strokeWidth="0.7"
              />
            );
          })
        : null}
      {POTEAUX.map(([x, y], i) =>
        sansPoteau.has(i) ? null : (
          <rect key={i} x={x} y={y} width="4" height="56" fill={couleur} stroke="#1f2937" strokeWidth="0.3" rx="1" />
        ),
      )}
      {maisonDevant ? maison : null}
      {coteMaison ? (
        <text
          x={{ front: 115, back: 95, left: 50, right: 160 }[coteMaison]}
          y={{ front: 104, back: 2, left: 4, right: 0 }[coteMaison]}
          textAnchor="middle"
          fontSize="6"
          fontWeight="700"
          fill="#92400e"
        >
          MAISON
        </text>
      ) : null}
      <text x="115" y="114" textAnchor="middle" fontSize="6.5" fill="#334155">
        Largeur {mm(config.largeurMm)}
      </text>
      <text x="190" y="62" textAnchor="middle" fontSize="6.5" fill="#334155" transform="rotate(48 190 62)">
        Avancée {mm(config.avanceeMm)}
      </text>
    </svg>
  );
}

// ── Petits composants ────────────────────────────────────────────────────────
function Etape({ n, titre, children }: { n: number; titre: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-bold">
        <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
          {n}
        </span>
        {titre}
      </h3>
      {children}
    </section>
  );
}

function Carte({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-3 text-left ${actif ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "border-border bg-white hover:bg-muted"}`}
    >
      {children}
    </button>
  );
}

function Question({ label, aide, children }: { label: string; aide?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-semibold">{label}</p>
      {aide ? <p className="mb-2 text-xs text-muted-foreground">{aide}</p> : <div className="mb-2" />}
      {children}
    </div>
  );
}

function Puces({
  options,
  valeur,
  onChange,
}: {
  options: { id: string; label: string }[];
  valeur: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`rounded-full border px-3 py-1.5 text-sm ${
            valeur === o.id ? "border-primary bg-primary font-semibold text-primary-foreground" : "border-border bg-white hover:bg-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ChampMm({
  label,
  aide,
  valeur,
  onChange,
}: {
  label: string;
  aide?: string;
  valeur: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <label className="block text-xs text-muted-foreground">
      {label}
      {aide ? <span className="font-normal"> ({aide})</span> : null}
      <div className="mt-1 flex items-center gap-1.5">
        <input
          inputMode="numeric"
          value={valeur ?? ""}
          onChange={(e) => {
            const n = Number(e.target.value.replace(/\D/g, ""));
            onChange(n > 0 ? Math.min(n, 19_999) : null);
          }}
          className="w-full min-w-0 rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        />
        <span>mm</span>
      </div>
    </label>
  );
}
