// Métré structuré + points de la validation de chantier par le client.
// Module PUR (importable côté client et serveur) : aucune dépendance à la DB.
import {
  couleurLamesDe,
  couleurStructure,
  libellePose,
  modeleDe,
  poseDe,
  type ConfigSM,
  type Pose,
} from "@/app/(app)/leads/[id]/devis/[devisId]/sur-mesure";

export type Metre = {
  largeurMm: number | null;
  avanceeMm: number | null;
  hauteurMm: number | null;
  pose: Pose | null;
  remarques: string | null;
  saisiAt?: string | null;
  saisiPar?: string | null; // nom de la personne qui a saisi
};

// Un point présenté au client dans le chat. `lignes` = texte EXACT affiché.
export type PointValidation = {
  cle: string;
  titre: string;
  lignes: string[];
  documentId?: string;
  documentNom?: string;
};

export type ReponsePoint = { ok: boolean; commentaire: string | null };
export type Reponses = Record<string, ReponsePoint>;

export type StatutValidation = "demandee" | "validee" | "a_corriger" | "annulee";

export const mm = (v: number | null | undefined) =>
  v == null ? "—" : `${Math.round(v).toLocaleString("fr-FR")} mm`;

export function metreComplet(m: Metre | null | undefined): m is Metre {
  return !!m && !!m.largeurMm && !!m.avanceeMm && !!m.pose;
}

// Lecture tolérante du jsonb `leads.metre`.
export function lireMetre(v: unknown): Metre | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : null);
  const pose = o.pose === "adossee" || o.pose === "autoportee" ? o.pose : null;
  return {
    largeurMm: n(o.largeurMm),
    avanceeMm: n(o.avanceeMm),
    hauteurMm: n(o.hauteurMm),
    pose,
    remarques: typeof o.remarques === "string" && o.remarques.trim() ? o.remarques.trim() : null,
    saisiAt: typeof o.saisiAt === "string" ? o.saisiAt : null,
    saisiPar: typeof o.saisiPar === "string" ? o.saisiPar : null,
  };
}

// Pergola principale du devis signé (config.pergola), ou null.
export function pergolaDuDevis(config: unknown): ConfigSM | null {
  const p = (config as { pergola?: ConfigSM | null } | null)?.pergola;
  return p && typeof p === "object" && typeof p.toitL === "number" ? p : null;
}

// Métré pré-rempli depuis le devis signé (largeur / avancée / pose).
export function metreDepuisDevis(cfg: ConfigSM | null): Metre {
  return {
    largeurMm: cfg?.toitL ? Math.round(cfg.toitL * 1000) : null,
    avanceeMm: cfg?.toitW ? Math.round(cfg.toitW * 1000) : null,
    hauteurMm: null,
    pose: cfg ? poseDe(cfg) : null,
    remarques: null,
  };
}

// Écarts du métré par rapport au devis (affichés à l'ADV, pas au client).
export function ecartsMetre(m: Metre | null, cfg: ConfigSM | null): string[] {
  if (!m || !cfg) return [];
  const e: string[] = [];
  const d = metreDepuisDevis(cfg);
  if (m.largeurMm && d.largeurMm && m.largeurMm !== d.largeurMm)
    e.push(`Largeur ${mm(m.largeurMm)} (devis : ${mm(d.largeurMm)})`);
  if (m.avanceeMm && d.avanceeMm && m.avanceeMm !== d.avanceeMm)
    e.push(`Avancée ${mm(m.avanceeMm)} (devis : ${mm(d.avanceeMm)})`);
  if (m.pose && d.pose && m.pose !== d.pose)
    e.push(`Pose ${m.pose === "adossee" ? "adossée" : "autoportée"} (devis : ${d.pose === "adossee" ? "adossée" : "autoportée"})`);
  return e;
}

type LigneDevis = { designation?: string; quantite?: number };
const estLigneTechnique = (d: string) => {
  const s = d.trim().toLowerCase();
  return !s || s.startsWith("clause suspensive") || s.startsWith("remise") || s.startsWith("acompte");
};

// Construit les points présentés au client, dans l'ordre du chat.
export function construirePoints(opts: {
  adressePose: string | null;
  metre: Metre;
  config: unknown;
  lignesDevis: unknown;
  documents: { id: string; nom: string }[];
}): PointValidation[] {
  const { metre } = opts;
  const cfg = pergolaDuDevis(opts.config);
  const modele = cfg ? modeleDe(cfg.modele) : null;
  const pts: PointValidation[] = [];

  if (opts.adressePose)
    pts.push({ cle: "adresse", titre: "Adresse du chantier", lignes: [opts.adressePose] });

  pts.push({
    cle: "dimensions",
    titre: "Dimensions relevées lors du métré",
    lignes: [
      `Largeur : ${mm(metre.largeurMm)}`,
      `Avancée : ${mm(metre.avanceeMm)}`,
      ...(metre.hauteurMm ? [`Hauteur : ${mm(metre.hauteurMm)}`] : []),
    ],
  });

  if (metre.pose)
    pts.push({
      cle: "pose",
      titre: "Type de pose",
      lignes: [
        modele
          ? libellePose(metre.pose, modele)
          : metre.pose === "adossee"
            ? "Adossée (fixée au mur)"
            : "Autoportée (4 poteaux)",
      ],
    });

  if (cfg && modele) {
    const lames = couleurLamesDe(cfg);
    pts.push({
      cle: "modele",
      titre: "Modèle et coloris",
      lignes: [
        modele.libelle,
        `Couleur${lames ? " de la structure" : ""} : ${couleurStructure(cfg)}`,
        ...(lames ? [`Couleur des lames : ${lames}`] : []),
        ...(modele.lames && cfg.ledLames ? ["Éclairage LED intégré aux lames"] : []),
      ],
    });
  }

  const equipements = (Array.isArray(opts.lignesDevis) ? (opts.lignesDevis as LigneDevis[]) : [])
    .filter((l) => typeof l?.designation === "string" && !estLigneTechnique(l.designation))
    .map((l) => {
      const q = Number(l.quantite ?? 1);
      return `${l.designation!.trim()}${q > 1 ? ` × ${q.toLocaleString("fr-FR")}` : ""}`;
    });
  if (equipements.length)
    pts.push({ cle: "equipements", titre: "Équipements commandés", lignes: equipements });

  if (metre.remarques)
    pts.push({ cle: "remarques", titre: "Remarques du métreur", lignes: [metre.remarques] });

  for (const d of opts.documents)
    pts.push({
      cle: `doc:${d.id}`,
      titre: "Document à valider",
      lignes: [d.nom],
      documentId: d.id,
      documentNom: d.nom,
    });

  return pts;
}

export const PARTAGES = [
  { value: "interne", label: "Interne" },
  { value: "client", label: "Visible client" },
  { value: "a_valider", label: "À faire valider" },
] as const;
export type Partage = (typeof PARTAGES)[number]["value"];
export const estPartage = (v: string): v is Partage => PARTAGES.some((p) => p.value === v);

// Adresse du chantier : adresse de pose si différente, sinon adresse client.
export function adresseChantier(l: {
  adressePose: string | null;
  adresse: string | null;
  codePostal: string | null;
  ville: string | null;
}): string | null {
  return (
    l.adressePose?.trim() ||
    [l.adresse, [l.codePostal, l.ville].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", ") ||
    null
  );
}
