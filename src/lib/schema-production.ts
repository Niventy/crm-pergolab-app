// Schéma de production présenté au client dans l'espace client (formulaire
// « Validez votre schéma de production », même logique visuelle que le
// configurateur de pergolab.fr : vue 3D + un choix par côté). Catalogue = celui
// du CRM (devis signé + métré). Module PUR : aucune dépendance à la DB.
import {
  couleurLamesDe,
  couleurStructure,
  FACES,
  libellePose,
  modeleDe,
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
// Faces du devis (« Façade avant »…) → côtés du schéma.
const FACE_VERS_COTE: Record<string, Cote> = {
  [FACES[0]]: "front",
  [FACES[1]]: "back",
  [FACES[2]]: "left",
  [FACES[3]]: "right",
};

export type Fermeture = { label: string; largeurMm: number | null; hauteurMm: number | null; qte: number };

// Figé au moment de la demande (validations_chantier.schema).
export type SchemaProduction = {
  modele: string; // « Pergola Horizon »
  lames: boolean; // pergola bioclimatique (lames orientables) / carport
  largeurMm: number | null;
  avanceeMm: number | null;
  hauteurMm: number | null;
  pose: Pose | null;
  poseLabel: string | null;
  couleurStructure: string | null;
  couleurLames: string | null; // si différente de la structure
  ledLames: boolean;
  fermetures: Record<Cote, Fermeture[]>;
};

// ── Précisions demandées au client ───────────────────────────────────────────
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
  coteMaison: Cote | null; // côté adossé au mur (pose adossée)
  ouvertureLames: Ouverture | null;
  sol: Sol | null;
  solPrecision: string | null;
  hauteurDispoMm: number | null; // hauteur libre disponible (sous gouttière, linteau…)
  photos: string[]; // ids documents déposés par le client
};

export const libelleSol = (s: string | null | undefined) => SOLS.find((x) => x.id === s)?.label ?? null;
export const libelleOuverture = (o: string | null | undefined) =>
  OUVERTURES.find((x) => x.id === o)?.label ?? null;

const vide = (): Record<Cote, Fermeture[]> => ({ front: [], back: [], left: [], right: [] });
const mmDe = (m: number | undefined) => (m && m > 0 ? Math.round(m * 1000) : null);

// Construit le schéma : dimensions / pose du MÉTRÉ (réel), modèle / coloris /
// fermetures du devis signé. Options « à la surface » posées sur une face =
// fermetures de ce côté ; les autres options restent dans « Équipements ».
export function construireSchema(opts: {
  metre: Metre;
  config: unknown;
  options: OptionSM[];
}): SchemaProduction | null {
  const cfg: ConfigSM | null = pergolaDuDevis(opts.config);
  if (!cfg) return null;
  const modele = modeleDe(cfg.modele);
  const pose = opts.metre.pose ?? null;
  const fermetures = vide();
  for (const el of cfg.elements ?? []) {
    const cote = FACE_VERS_COTE[el.face];
    const o = opts.options.find((x) => x.id === el.optionId);
    if (!cote || !o || o.type === "unite") continue;
    fermetures[cote].push({
      label: o.label,
      largeurMm: mmDe(el.L),
      hauteurMm: mmDe(el.H),
      qte: Math.max(1, Math.round(el.qte || 1)),
    });
  }
  return {
    modele: modele.libelle,
    lames: modele.lames,
    largeurMm: opts.metre.largeurMm,
    avanceeMm: opts.metre.avanceeMm,
    hauteurMm: opts.metre.hauteurMm,
    pose,
    poseLabel: pose ? libellePose(pose, modele) : null,
    couleurStructure: couleurStructure(cfg),
    couleurLames: couleurLamesDe(cfg),
    ledLames: modele.lames && !!cfg.ledLames,
    fermetures,
  };
}

// Lecture tolérante du jsonb (anciennes demandes : null).
export function lireSchema(v: unknown): SchemaProduction | null {
  if (!v || typeof v !== "object") return null;
  const s = v as SchemaProduction;
  if (typeof s.modele !== "string" || !s.fermetures) return null;
  const f = vide();
  for (const c of COTES) f[c] = Array.isArray(s.fermetures[c]) ? s.fermetures[c] : [];
  return { ...s, fermetures: f };
}

// Lignes « Fermetures » (point validé par le client), une par côté fermé.
export function lignesFermetures(s: SchemaProduction): string[] {
  return COTES.flatMap((c) =>
    s.fermetures[c].map(
      (f) =>
        `${COTE_LABEL[c]} : ${f.label}${f.qte > 1 ? ` × ${f.qte}` : ""}${
          f.largeurMm && f.hauteurMm ? ` (${f.largeurMm} L × ${f.hauteurMm} H mm)` : ""
        }`,
    ),
  );
}

// Côté du mur proposé par défaut pour une pose adossée.
export const coteMaisonParDefaut = (s: SchemaProduction | null): Cote | null =>
  s?.pose === "adossee" ? "back" : null;

// Validation / normalisation des précisions envoyées par le client.
export function lireDetails(
  v: unknown,
  s: SchemaProduction | null,
): { ok: true; details: DetailsClient } | { ok: false; error: string } {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const cote = COTES.includes(o.coteMaison as Cote) ? (o.coteMaison as Cote) : null;
  const ouverture = OUVERTURES.some((x) => x.id === o.ouvertureLames) ? (o.ouvertureLames as Ouverture) : null;
  const sol = SOLS.some((x) => x.id === o.sol) ? (o.sol as Sol) : null;
  const precision =
    typeof o.solPrecision === "string" && o.solPrecision.trim() ? o.solPrecision.trim().slice(0, 500) : null;
  const h = Math.round(Number(o.hauteurDispoMm));
  const photos = Array.isArray(o.photos)
    ? o.photos.filter((p): p is string => typeof p === "string" && /^[0-9a-f-]{36}$/i.test(p)).slice(0, 10)
    : [];
  if (s?.pose === "adossee" && !cote) return { ok: false, error: "Indiquez de quel côté se trouve votre maison." };
  if (!sol) return { ok: false, error: "Indiquez le type de sol à l'emplacement de la pergola." };
  if (s?.lames && !ouverture) return { ok: false, error: "Indiquez le sens d'ouverture des lames souhaité." };
  return {
    ok: true,
    details: {
      coteMaison: s?.pose === "adossee" ? cote : null,
      ouvertureLames: s?.lames ? ouverture : null,
      sol,
      solPrecision: precision,
      hauteurDispoMm: Number.isFinite(h) && h > 0 && h < 20_000 ? h : null,
      photos,
    },
  };
}

// Résumé des précisions (journal + fiche).
export function resumeDetails(d: DetailsClient): string[] {
  return [
    d.coteMaison ? `Maison côté ${COTE_LABEL[d.coteMaison].toLowerCase()}` : null,
    d.ouvertureLames ? `Ouverture des lames : ${libelleOuverture(d.ouvertureLames)?.toLowerCase()}` : null,
    d.sol ? `Sol : ${libelleSol(d.sol)}${d.solPrecision ? ` (${d.solPrecision})` : ""}` : null,
    d.hauteurDispoMm ? `Hauteur disponible : ${d.hauteurDispoMm.toLocaleString("fr-FR")} mm` : null,
    d.photos.length ? `${d.photos.length} photo${d.photos.length > 1 ? "s" : ""} de l'emplacement` : null,
  ].filter((x): x is string => !!x);
}
