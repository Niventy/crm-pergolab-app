// Schéma de production configuré PAR LE CLIENT dans son espace (même logique que
// le configurateur de pergolab.fr : modèle, dimensions, pose, coloris, une
// fermeture par côté, équipements), pré-rempli depuis le devis signé + le métré.
// L'équipe voit les écarts avec cette référence. Aucun prix n'est affiché au
// client. Module PUR (client + serveur) : aucune dépendance à la DB.
import {
  COULEUR_STANDARD,
  couleurLamesDe,
  couleurStructure,
  FACES,
  libellePose,
  MODELES,
  modeleDe,
  poseDe,
  type ConfigSM,
  type OptionSM,
  type Pose,
} from "@/app/(app)/leads/[id]/devis/[devisId]/sur-mesure";
import { pergolaDuDevis, type Metre } from "@/lib/chantier-validation";

export type Cote = "front" | "back" | "left" | "right";
export const COTES: Cote[] = ["front", "back", "left", "right"];
export const COTE_LABEL: Record<Cote, string> = {
  front: "Avant",
  back: "Arrière",
  left: "Gauche",
  right: "Droite",
};
const FACE_VERS_COTE: Record<string, Cote> = {
  [FACES[0]]: "front",
  [FACES[1]]: "back",
  [FACES[2]]: "left",
  [FACES[3]]: "right",
};

// ── Configuration ───────────────────────────────────────────────────────────
export type ConfigClient = {
  modele: string; // code MODELES (ESSENTIA…)
  largeurMm: number | null;
  avanceeMm: number | null;
  hauteurMm: number | null;
  pose: Pose;
  couleur: string; // « RAL 7016 Gris anthracite » ou saisie libre
  couleurLames: string | null; // null = identique à la structure
  ledLames: boolean;
  fermetures: Record<Cote, string | null>; // optionId (surface) par côté
  equipements: { optionId: string; qte: number }[]; // options « à l'unité »
};

// Options proposées au client : fermetures = surface / surface_forfait, équipements = unité.
export const estFermeture = (o: OptionSM) => o.type !== "unite";

const mmDe = (m: number | undefined) => (m && m > 0 ? Math.round(m * 1000) : null);

// Point de départ : devis signé (modèle, coloris, fermetures, équipements) et
// métré s'il existe (dimensions, pose), sinon dimensions du devis.
export function configDepuisDevis(opts: {
  config: unknown;
  metre: Metre | null;
  options: OptionSM[];
}): ConfigClient {
  const cfg: ConfigSM | null = pergolaDuDevis(opts.config);
  const fermetures: ConfigClient["fermetures"] = { front: null, back: null, left: null, right: null };
  const equipements: ConfigClient["equipements"] = [];
  for (const el of cfg?.elements ?? []) {
    const o = opts.options.find((x) => x.id === el.optionId);
    if (!o) continue;
    if (estFermeture(o)) {
      const c = FACE_VERS_COTE[el.face];
      if (c && !fermetures[c]) fermetures[c] = o.id;
    } else {
      const deja = equipements.find((e) => e.optionId === o.id);
      const q = Math.max(1, Math.round(el.qte || 1));
      if (deja) deja.qte += q;
      else equipements.push({ optionId: o.id, qte: q });
    }
  }
  const pose = opts.metre?.pose ?? (cfg ? poseDe(cfg) : "adossee");
  return {
    modele: cfg ? modeleDe(cfg.modele).code : MODELES[0].code,
    largeurMm: opts.metre?.largeurMm ?? mmDe(cfg?.toitL),
    avanceeMm: opts.metre?.avanceeMm ?? mmDe(cfg?.toitW),
    hauteurMm: opts.metre?.hauteurMm ?? null,
    pose,
    couleur: cfg ? couleurStructure(cfg) : COULEUR_STANDARD,
    couleurLames: cfg ? couleurLamesDe(cfg) : null,
    ledLames: !!cfg?.ledLames,
    fermetures,
    equipements,
  };
}

const COTE_OK = (v: unknown): v is Cote => COTES.includes(v as Cote);
const entier = (v: unknown, min: number, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const texte = (v: unknown, max = 80) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

// Lecture / validation (corps envoyé par le client, ou jsonb relu).
export function lireConfig(
  v: unknown,
  options: OptionSM[],
): { ok: true; config: ConfigClient } | { ok: false; error: string } {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const modele = MODELES.find((m) => m.code === o.modele);
  if (!modele) return { ok: false, error: "Choisissez un modèle." };
  const largeurMm = entier(o.largeurMm, 1000, 15000);
  const avanceeMm = entier(o.avanceeMm, 1000, 10000);
  if (!largeurMm || !avanceeMm)
    return { ok: false, error: "Indiquez la largeur et l'avancée (entre 1 000 et 15 000 mm)." };
  const pose: Pose = o.pose === "autoportee" ? "autoportee" : "adossee";
  const couleur = texte(o.couleur) ?? COULEUR_STANDARD;
  const fermIn = (o.fermetures && typeof o.fermetures === "object" ? o.fermetures : {}) as Record<string, unknown>;
  const fermetures = { front: null, back: null, left: null, right: null } as ConfigClient["fermetures"];
  for (const c of COTES) {
    const id = fermIn[c];
    if (typeof id === "string" && options.some((x) => x.id === id && estFermeture(x))) fermetures[c] = id;
  }
  const equipements = (Array.isArray(o.equipements) ? o.equipements : [])
    .map((e) => e as { optionId?: unknown; qte?: unknown })
    .filter((e) => typeof e.optionId === "string" && options.some((x) => x.id === e.optionId && !estFermeture(x)))
    .map((e) => ({ optionId: e.optionId as string, qte: entier(e.qte, 1, 20) ?? 1 }))
    .filter((e, i, a) => a.findIndex((x) => x.optionId === e.optionId) === i);
  return {
    ok: true,
    config: {
      modele: modele.code,
      largeurMm,
      avanceeMm,
      hauteurMm: entier(o.hauteurMm, 1500, 5000),
      pose,
      couleur,
      couleurLames: modele.lames ? texte(o.couleurLames) : null,
      ledLames: modele.lames && o.ledLames === true,
      fermetures,
      equipements,
    },
  };
}

const nomOption = (id: string | null, options: OptionSM[]) =>
  id ? (options.find((x) => x.id === id)?.label ?? id) : null;
const mmTxt = (v: number | null) => (v ? `${v.toLocaleString("fr-FR")} mm` : "—");

// Résumé lisible (journal, fiche, récapitulatif client).
export function resumeConfig(c: ConfigClient, options: OptionSM[]): string[] {
  const m = modeleDe(c.modele);
  const ferm = COTES.filter((x) => c.fermetures[x]).map(
    (x) => `${COTE_LABEL[x]} : ${nomOption(c.fermetures[x], options)}`,
  );
  return [
    `${m.libelle} — ${libellePose(c.pose, m)}`,
    `${mmTxt(c.largeurMm)} × ${mmTxt(c.avanceeMm)}${c.hauteurMm ? ` · H ${mmTxt(c.hauteurMm)}` : ""}`,
    `Couleur : ${c.couleur}${c.couleurLames ? ` · lames ${c.couleurLames}` : ""}${c.ledLames ? " · LED dans les lames" : ""}`,
    ferm.length ? `Fermetures — ${ferm.join(" · ")}` : "Aucune fermeture",
    ...(c.equipements.length
      ? [`Équipements — ${c.equipements.map((e) => `${nomOption(e.optionId, options)}${e.qte > 1 ? ` × ${e.qte}` : ""}`).join(" · ")}`]
      : []),
  ];
}

// Écarts entre la configuration du client et la référence (devis + métré).
export function ecartsConfig(c: ConfigClient, ref: ConfigClient, options: OptionSM[]): string[] {
  const e: string[] = [];
  const m = (code: string) => modeleDe(code).libelle;
  if (c.modele !== ref.modele) e.push(`Modèle : ${m(c.modele)} (devis : ${m(ref.modele)})`);
  if (c.largeurMm !== ref.largeurMm) e.push(`Largeur : ${mmTxt(c.largeurMm)} (référence : ${mmTxt(ref.largeurMm)})`);
  if (c.avanceeMm !== ref.avanceeMm) e.push(`Avancée : ${mmTxt(c.avanceeMm)} (référence : ${mmTxt(ref.avanceeMm)})`);
  if (ref.hauteurMm && c.hauteurMm !== ref.hauteurMm)
    e.push(`Hauteur : ${mmTxt(c.hauteurMm)} (métré : ${mmTxt(ref.hauteurMm)})`);
  if (c.pose !== ref.pose)
    e.push(`Pose : ${c.pose === "adossee" ? "adossée" : "autoportée"} (référence : ${ref.pose === "adossee" ? "adossée" : "autoportée"})`);
  if (c.couleur.toUpperCase() !== ref.couleur.toUpperCase()) e.push(`Couleur : ${c.couleur} (devis : ${ref.couleur})`);
  if ((c.couleurLames ?? "") !== (ref.couleurLames ?? ""))
    e.push(`Couleur des lames : ${c.couleurLames ?? "identique"} (devis : ${ref.couleurLames ?? "identique"})`);
  if (c.ledLames !== ref.ledLames) e.push(`LED dans les lames : ${c.ledLames ? "oui" : "non"} (devis : ${ref.ledLames ? "oui" : "non"})`);
  for (const x of COTES)
    if (c.fermetures[x] !== ref.fermetures[x])
      e.push(
        `${COTE_LABEL[x]} : ${nomOption(c.fermetures[x], options) ?? "ouvert"} (devis : ${nomOption(ref.fermetures[x], options) ?? "ouvert"})`,
      );
  const ids = new Set([...c.equipements, ...ref.equipements].map((x) => x.optionId));
  for (const id of ids) {
    const a = c.equipements.find((x) => x.optionId === id)?.qte ?? 0;
    const b = ref.equipements.find((x) => x.optionId === id)?.qte ?? 0;
    if (a !== b) e.push(`${nomOption(id, options)} : ${a} (devis : ${b})`);
  }
  return e;
}

// Enregistré dans validations_chantier.schema.
export type SchemaEnregistre = { config: ConfigClient; reference: ConfigClient; ecarts: string[]; resume: string[] };
export function lireSchemaEnregistre(v: unknown): SchemaEnregistre | null {
  const s = v as SchemaEnregistre | null;
  return s && typeof s === "object" && s.config && Array.isArray(s.ecarts) ? s : null;
}

// ── Précisions de pose ──────────────────────────────────────────────────────
export const SOLS = [
  { id: "dalle_beton", label: "Dalle béton" },
  { id: "carrelage", label: "Carrelage sur dalle" },
  { id: "bois", label: "Terrasse bois / composite" },
  { id: "pave", label: "Pavés / dallage posé" },
  { id: "terre", label: "Terre / gazon / gravier" },
  { id: "autre", label: "Autre / je ne sais pas" },
] as const;
export type Sol = (typeof SOLS)[number]["id"];

export const OUVERTURES = [
  { id: "vers_maison", label: "Vers la maison" },
  { id: "vers_jardin", label: "Vers le jardin" },
  { id: "indifferent", label: "Pas de préférence" },
] as const;
export type Ouverture = (typeof OUVERTURES)[number]["id"];

export type DetailsClient = {
  coteMaison: Cote | null;
  ouvertureLames: Ouverture | null;
  sol: Sol | null;
  solPrecision: string | null;
  hauteurDispoMm: number | null;
  photos: string[];
};

export const libelleSol = (s: string | null | undefined) => SOLS.find((x) => x.id === s)?.label ?? null;
export const libelleOuverture = (o: string | null | undefined) => OUVERTURES.find((x) => x.id === o)?.label ?? null;

export function lireDetails(
  v: unknown,
  c: ConfigClient,
): { ok: true; details: DetailsClient } | { ok: false; error: string } {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const lames = modeleDe(c.modele).lames;
  const cote = COTE_OK(o.coteMaison) ? o.coteMaison : null;
  const ouverture = OUVERTURES.some((x) => x.id === o.ouvertureLames) ? (o.ouvertureLames as Ouverture) : null;
  const sol = SOLS.some((x) => x.id === o.sol) ? (o.sol as Sol) : null;
  if (c.pose === "adossee" && !cote) return { ok: false, error: "Indiquez de quel côté se trouve votre maison." };
  if (lames && !ouverture) return { ok: false, error: "Indiquez le sens d'ouverture des lames souhaité." };
  if (!sol) return { ok: false, error: "Indiquez le type de sol à l'emplacement de la pergola." };
  const photos = Array.isArray(o.photos)
    ? o.photos.filter((p): p is string => typeof p === "string" && /^[0-9a-f-]{36}$/i.test(p)).slice(0, 20)
    : [];
  return {
    ok: true,
    details: {
      coteMaison: c.pose === "adossee" ? cote : null,
      ouvertureLames: lames ? ouverture : null,
      sol,
      solPrecision: texte(o.solPrecision, 500),
      hauteurDispoMm: entier(o.hauteurDispoMm, 1, 19_999),
      photos,
    },
  };
}

export function resumeDetails(d: DetailsClient): string[] {
  return [
    d.coteMaison ? `Maison côté ${COTE_LABEL[d.coteMaison].toLowerCase()}` : null,
    d.ouvertureLames ? `Ouverture des lames : ${libelleOuverture(d.ouvertureLames)?.toLowerCase()}` : null,
    d.sol ? `Sol : ${libelleSol(d.sol)}${d.solPrecision ? ` (${d.solPrecision})` : ""}` : null,
    d.hauteurDispoMm ? `Hauteur disponible : ${d.hauteurDispoMm.toLocaleString("fr-FR")} mm` : null,
    d.photos.length ? `${d.photos.length} photo${d.photos.length > 1 ? "s" : ""} de l'emplacement` : null,
  ].filter((x): x is string => !!x);
}
