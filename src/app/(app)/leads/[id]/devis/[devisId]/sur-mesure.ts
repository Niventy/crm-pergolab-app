// Moteur de prix sur-mesure — transcription fidèle du classeur
// « Price Calculation HT VENDEUR » (feuilles E140U / E175U / E220).
// Tous les prix sont en HT vendeur.

export type Ligne = {
  designation: string;
  quantite: number;
  prixHt: number;
  tva: number;
  productId?: number | null;
  description?: string | null;
  config?: boolean; // ligne issue du configurateur (pour la remplacer proprement)
};

export type Modele = {
  code: string;
  libelle: string; // libellé du kit sur le devis (« Pergola Horizon », « Carport »)
  prixToit: number; // €/m²
  prixPoteau: number; // €/pièce
  // Pergola bioclimatique : lames orientables (LED périmétrique, spots, couleur
  // et éclairage des lames). Faux pour un carport (toit plein).
  lames: boolean;
  // Genre du libellé, pour accorder la pose : « Pergola … — Adossée » / « Carport — Adossé ».
  genre: "f" | "m";
};

// Seuls le toit et les poteaux changent selon le modèle (le reste est identique).
// Gammes commerciales : ESSENTIA (140U) / HORIZON (175U) / SIGNATURE (220).
export const MODELES: Modele[] = [
  { code: "ESSENTIA", libelle: "Pergola Essentia", prixToit: 521.5, prixPoteau: 262.5, lames: true, genre: "f" },
  { code: "HORIZON", libelle: "Pergola Horizon", prixToit: 588, prixPoteau: 325.5, lames: true, genre: "f" },
  { code: "SIGNATURE", libelle: "Pergola Signature", prixToit: 707, prixPoteau: 392, lames: true, genre: "f" },
  // Carport : toit plein 519 € HT/m² (tarif vendeur), poteaux inclus, ni LED ni
  // spots ni lames ; description type CARPORT avec les dimensions.
  { code: "CARPORT", libelle: "Carport", prixToit: 519, prixPoteau: 0, lames: false, genre: "m" },
];

// Type de pose, CHOISI explicitement dans le configurateur (avant : déduit du
// nombre de poteaux, et à l'envers — 2 poteaux affichait « Autoportée »).
// Adossée = fixée au mur, 2 poteaux par défaut · Autoportée = 4 poteaux.
export type Pose = "adossee" | "autoportee";
export const POSES: { id: Pose; label: string; poteaux: number }[] = [
  { id: "adossee", label: "Adossée", poteaux: 2 },
  { id: "autoportee", label: "Autoportée", poteaux: 4 },
];
// Pose effective : celle choisie ; à défaut (anciennes configs) 2 poteaux ou
// moins = adossée, sinon autoportée.
export const poseDe = (cfg: { pose?: Pose | null; poteaux?: number }): Pose =>
  cfg.pose ?? ((cfg.poteaux || 0) <= 2 ? "adossee" : "autoportee");
// Libellé accordé au modèle : « Adossée / Autoportée » (pergola), « Adossé / Autoportant » (carport).
export function libellePose(pose: Pose, m: Modele): string {
  if (m.genre === "m") return pose === "adossee" ? "Adossé" : "Autoportant";
  return pose === "adossee" ? "Adossée" : "Autoportée";
}
export const modeleDe = (code: string): Modele =>
  MODELES.find((m) => m.code === code) ?? MODELES[0];

export const PRIX_LED = 28; // €/m de périmètre
export const PRIX_ECLAIRAGE = 297.5; // €/unité (Lighting Control System)

const r2 = (n: number) => Math.round(n * 100) / 100;

export type OptionType = "surface" | "surface_forfait" | "unite";

export type OptionSM = {
  id: string;
  label: string;
  type: OptionType;
  prix: number;
  forfait?: number; // pour surface_forfait
  defL?: number; // largeur par défaut (m)
  defH?: number; // hauteur par défaut (m)
  actif?: boolean; // false = retirée du configurateur (table options_configurateur)
};
export const OPTION_TYPES: { id: OptionType; label: string }[] = [
  { id: "surface", label: "Surface — € HT / m²" },
  { id: "surface_forfait", label: "Surface + forfait — € HT / m² + forfait / pièce" },
  { id: "unite", label: "À l'unité — € HT / pièce" },
];

// Options PAR DÉFAUT (classeur d'origine) : servent à l'amorçage de la table
// options_configurateur et de secours si elle est vide. En fonctionnement
// normal, la liste vient de la base (getOptionsConfigurateur) et est passée
// en paramètre `options` aux fonctions ci-dessous.
export const OPTIONS: OptionSM[] = [
  { id: "zip", label: "Store Motorisé", type: "surface_forfait", prix: 189, forfait: 255.5, defL: 4.76, defH: 2.33 },
  { id: "baie", label: "Rideau Verre", type: "surface", prix: 413, defL: 2.76, defH: 2.33 },
  { id: "volet_fixe", label: "Persienne fixe", type: "surface", prix: 420, defL: 4.63, defH: 2.33 },
  { id: "volet_coul", label: "Persienne coulissante", type: "surface", prix: 476, defL: 4.63, defH: 2.33 },
  { id: "volet_pliant", label: "Persienne pliante (bi-folding)", type: "surface", prix: 518, defL: 4.63, defH: 2.33 },
  { id: "mur_fixe", label: "Mur alu fixe", type: "surface", prix: 333, defL: 4.63, defH: 2.33 },
  { id: "lames_motor", label: "Lames alu motorisées", type: "surface_forfait", prix: 437.5, forfait: 595, defL: 4.63, defH: 2.33 },
  { id: "chauffage", label: "Chauffage (1500 W)", type: "unite", prix: 875 },
  { id: "ventilo", label: "Ventilateur (sans LED)", type: "unite", prix: 332 },
  { id: "ventilo_led", label: "Ventilateur (avec LED)", type: "unite", prix: 420 },
  { id: "capteur", label: "Capteur vent & pluie", type: "unite", prix: 175 },
  { id: "coffre", label: "Coffre bois pour vitrage", type: "unite", prix: 230 },
];

export type OptionConfig = { qte: number; L: number; H: number };

// Faces de la pergola — pour savoir de quel côté va chaque option (devis).
export const FACES = ["Façade avant", "Arrière", "Côté gauche", "Côté droit"];

// Un élément posé = une option, sur une face, avec ses dimensions et sa quantité.
export type Element = {
  optionId: string;
  face: string;
  L: number;
  H: number;
  qte: number;
};

// Coloris de la structure (thermolaquage). Le premier est la teinte standard,
// sans supplément ; les autres passent par une ligne « Option couleur » sur le
// devis (prix libre, souvent OFFERTE → 0 €, comme sur les anciennes factures).
export type CouleurRal = { code: string; nom: string; standard?: boolean };
export const COULEURS_RAL: CouleurRal[] = [
  { code: "RAL 7016", nom: "Gris anthracite", standard: true },
  { code: "RAL 9010", nom: "Blanc pur" },
  { code: "RAL 9005", nom: "Noir foncé" },
  { code: "RAL 9006", nom: "Aluminium blanc" },
  { code: "RAL 7035", nom: "Gris clair" },
  { code: "RAL 1015", nom: "Ivoire clair" },
  { code: "RAL 6003", nom: "Vert olive" },
  { code: "RAL 3004", nom: "Rouge pourpre" },
  { code: "RAL 5003", nom: "Bleu saphir" },
];
export const COULEUR_AUTRE = "AUTRE"; // saisie libre (code + nom)
export const COULEUR_STANDARD = `${COULEURS_RAL[0].code} ${COULEURS_RAL[0].nom}`;

// Éclairage LED intégré aux lames (libellé de la ligne de devis quand il est
// facturé en supplément ; mentionné dans la description dans tous les cas).
export const LED_LAMES_LABEL = "Éclairage LED intégré aux lames";

export type ConfigSM = {
  modele: string;
  toitL: number; // largeur (m)
  toitW: number; // avancée (m)
  toitQte: number;
  poteaux: number;
  eclairage: number; // qté du système d'éclairage
  elements: Element[];
  // Option couleur : libellé complet (« RAL 9010 Blanc pur ») ; vide/absent = teinte standard.
  couleur?: string | null;
  couleurPrix?: number; // supplément HT (0 = offerte) — couvre structure ET lames
  // Couleur des LAMES si différente de la structure (pergola bicolore) ;
  // vide/absent = lames de la même teinte que la structure.
  couleurLames?: string | null;
  // Éclairage LED intégré aux lames : coché = rappelé sur le devis ; le
  // supplément HT (0 = inclus) crée une ligne de devis quand il est > 0.
  ledLames?: boolean;
  ledLamesPrix?: number;
  // Type de pose (adossée / autoportée) ; absent = déduit des poteaux (poseDe).
  pose?: Pose | null;
};

type Coloris = Pick<ConfigSM, "couleur" | "couleurLames">;
const estTeinteStandard = (c: string) => {
  const std = COULEURS_RAL.find((x) => x.standard);
  return !!std && c.toUpperCase().startsWith(std.code.toUpperCase());
};
// Teinte de la structure (standard si rien de choisi).
export const couleurStructure = (cfg: Coloris): string =>
  (cfg.couleur ?? "").trim() || COULEUR_STANDARD;
// Teinte des lames UNIQUEMENT si elle diffère de la structure, sinon null.
export function couleurLamesDe(cfg: Coloris): string | null {
  const l = (cfg.couleurLames ?? "").trim();
  if (!l) return null;
  return l.toUpperCase() === couleurStructure(cfg).toUpperCase() ? null : l;
}

// Libellé de l'option couleur, ou null si tout est standard :
// « RAL 9010 Blanc pur » (structure seule) · « structure RAL 9010 Blanc pur ·
// lames RAL 7016 Gris anthracite » (bicolore) · « lames RAL 9010 Blanc pur »
// (structure standard, lames différentes). Des lames d'une autre teinte sont
// toujours une option, même en teinte standard (fabrication bicolore).
export function couleurOption(cfg: Coloris): string | null {
  const s = (cfg.couleur ?? "").trim();
  const sOpt = s && !estTeinteStandard(s) ? s : null;
  const l = couleurLamesDe(cfg);
  if (sOpt && l) return `structure ${sOpt} · lames ${l}`;
  if (sOpt) return sOpt;
  if (l) return `lames ${l}`;
  return null;
}
const libelleCouleur = (cfg: ConfigSM) => {
  const c = couleurOption(cfg);
  if (!c) return null;
  const offerte = !((cfg.couleurPrix ?? 0) > 0);
  return `Option couleur — ${c}${offerte ? " (offerte)" : ""}`;
};
// Ligne « éclairage LED des lames » seulement s'il est facturé en supplément.
const prixLedLames = (cfg: ConfigSM) =>
  cfg.ledLames && (cfg.ledLamesPrix ?? 0) > 0 ? r2(cfg.ledLamesPrix ?? 0) : 0;

// Dimensions d'une option au format métier « 3350 L × 2500 H mm » (m → mm).
const dimsMM = (L: number, H: number) =>
  `${Math.round((L || 0) * 1000)} L × ${Math.round((H || 0) * 1000)} H mm`;

// Mention de pose sur la ligne du devis, TOUJOURS affichée (« — Adossée » ou
// « — Autoportée ») pour lever toute ambiguïté.
const suffixePose = (cfg: ConfigSM) =>
  ` — ${libellePose(poseDe(cfg), MODELES.find((x) => x.code === cfg.modele) ?? MODELES[0])}`;

// Prix d'une option (formule selon son type).
export function prixOption(o: OptionSM, c: OptionConfig): number {
  const q = c.qte || 0;
  if (q <= 0) return 0;
  if (o.type === "unite") return r2(q * o.prix);
  const surface = (c.L || 0) * (c.H || 0);
  if (o.type === "surface_forfait")
    return r2((surface * o.prix + (o.forfait ?? 0)) * q);
  return r2(surface * o.prix * q); // surface
}

// Liste des composants (pour l'écran de descriptions pré-stockées).
// Une pergola est vendue comme un KIT (toit + poteaux = un seul produit) : une
// seule description par gamme, clé = le code de la gamme (ESSENTIA/HORIZON/…).
// Les extras (LED, éclairage, options) ont leur propre description.
export type Composant = { id: string; label: string; groupe: string };
export function composantsPour(options: OptionSM[]): Composant[] {
  return [
    ...MODELES.map((m) => ({
      id: m.code,
      label: `${m.libelle} (kit toit + poteaux)`,
      groupe: "Gammes (texte principal du devis)",
    })),
    { id: "led", label: "Bandeau LED", groupe: "Structure & finitions" },
    { id: "eclairage", label: "Système d'éclairage", groupe: "Structure & finitions" },
    { id: "couleur", label: "Option couleur (RAL)", groupe: "Structure & finitions" },
    { id: "led_lames", label: LED_LAMES_LABEL, groupe: "Structure & finitions" },
    ...options.map((o) => ({
      id: o.id,
      label: o.label,
      groupe: "Options (une ligne par option sur le devis)",
    })),
  ];
}
export const COMPOSANTS: Composant[] = composantsPour(OPTIONS);

// Construit les lignes de devis détaillées à partir de la config.
// `descriptions` : id de composant → description pré-stockée (injectée sur la ligne
// et affichée dans le CRM / sur le devis).
export function construireLignes(
  cfg: ConfigSM,
  descriptions: Record<string, string> = {},
  options: OptionSM[] = OPTIONS,
): Ligne[] {
  const m = MODELES.find((x) => x.code === cfg.modele) ?? MODELES[0];
  const lignes: Ligne[] = [];
  const L = cfg.toitL || 0;
  const W = cfg.toitW || 0;

  // Toit
  const toit = r2(m.prixToit * L * W * (cfg.toitQte || 0));
  if (toit > 0)
    lignes.push({
      designation: `${m.libelle} — toit ${L}×${W} m`,
      description: descriptions[`toit_${m.code}`] || null,
      quantite: 1,
      prixHt: toit,
      tva: 20,
    });

  // Poteaux
  const poteaux = r2((cfg.poteaux || 0) * m.prixPoteau);
  if (poteaux > 0)
    lignes.push({
      designation: `Poteaux ${m.code} (×${cfg.poteaux})`,
      description: descriptions[`poteau_${m.code}`] || null,
      quantite: 1,
      prixHt: poteaux,
      tva: 20,
    });

  // LED (périmètre) — pergolas bioclimatiques uniquement
  const perimetre = r2((L + W) * 2);
  const led = m.lames ? r2(perimetre * PRIX_LED) : 0;
  if (led > 0)
    lignes.push({
      designation: `Bandeau LED (${perimetre} m de périmètre)`,
      description: descriptions["led"] || null,
      quantite: 1,
      prixHt: led,
      tva: 20,
    });

  // Système d'éclairage
  const ecl = m.lames ? r2((cfg.eclairage || 0) * PRIX_ECLAIRAGE) : 0;
  if (ecl > 0)
    lignes.push({
      designation: `Système d'éclairage (×${cfg.eclairage})`,
      description: descriptions["eclairage"] || null,
      quantite: 1,
      prixHt: ecl,
      tva: 20,
    });

  // Option couleur (hors teinte standard) — visible même offerte (0 €).
  const couleur = libelleCouleur(cfg);
  if (couleur)
    lignes.push({
      designation: couleur,
      description: descriptions["couleur"] || null,
      quantite: 1,
      prixHt: r2(cfg.couleurPrix ?? 0),
      tva: 20,
    });

  // Éclairage LED intégré aux lames (seulement s'il est en supplément).
  const ledLames = prixLedLames(cfg);
  if (ledLames > 0)
    lignes.push({
      designation: LED_LAMES_LABEL,
      description: descriptions["led_lames"] || null,
      quantite: 1,
      prixHt: ledLames,
      tva: 20,
    });

  // Éléments (options posées, avec leur face)
  for (const el of cfg.elements) {
    const o = options.find((x) => x.id === el.optionId);
    if (!o) continue;
    const p = prixOption(o, { qte: el.qte, L: el.L, H: el.H });
    if (p <= 0) continue;
    const dims =
      o.type === "unite" ? `×${el.qte}` : `${dimsMM(el.L, el.H)} · ×${el.qte}`;
    const face = el.face ? ` — ${el.face}` : "";
    lignes.push({
      designation: `${o.label}${face} (${dims})`,
      description: descriptions[o.id] || null,
      quantite: 1,
      prixHt: p,
      tva: 20,
    });
  }

  return lignes;
}

// Nombre « à la française » (virgule décimale, sans zéros inutiles).
const fr = (n: number) => String(r2(n)).replace(".", ",");

// Tokens que l'on peut écrire dans une description pré-stockée : ils sont
// remplacés par les valeurs du configurateur (utile pour la fiche produit).
// Ex. « Largeur {largeur} mm » → « Largeur 6000 mm » pour une pergola de 6 m.
export const TOKENS_DESCRIPTION: { token: string; libelle: string }[] = [
  { token: "{largeur}", libelle: "Largeur en mm" },
  { token: "{profondeur}", libelle: "Profondeur / avancée en mm" },
  { token: "{largeur_m}", libelle: "Largeur en m" },
  { token: "{profondeur_m}", libelle: "Profondeur / avancée en m" },
  { token: "{poteaux}", libelle: "Nombre de poteaux" },
  { token: "{surface}", libelle: "Surface au sol en m²" },
  { token: "{perimetre}", libelle: "Périmètre en m" },
  { token: "{gamme}", libelle: "Gamme (ESSENTIA / HORIZON / SIGNATURE)" },
  { token: "{couleur}", libelle: "Coloris de la structure (ex. RAL 9010 Blanc pur)" },
  { token: "{couleur_lames}", libelle: "Coloris des lames (= structure si non précisé)" },
];

// Remplace les tokens {…} d'un texte par les valeurs de la config.
// Les tokens inconnus sont laissés tels quels.
function injecterTokens(texte: string, cfg: ConfigSM): string {
  const m = MODELES.find((x) => x.code === cfg.modele) ?? MODELES[0];
  const L = cfg.toitL || 0;
  const W = cfg.toitW || 0;
  const map: Record<string, string> = {
    largeur: String(Math.round(L * 1000)),
    profondeur: String(Math.round(W * 1000)),
    avancee: String(Math.round(W * 1000)),
    largeur_m: fr(L),
    profondeur_m: fr(W),
    avancee_m: fr(W),
    poteaux: String(cfg.poteaux || 0),
    surface: fr(r2(L * W)),
    perimetre: fr(r2((L + W) * 2)),
    gamme: m.code,
    modele: m.code,
    couleur: couleurStructure(cfg),
    couleur_structure: couleurStructure(cfg),
    couleur_lames: couleurLamesDe(cfg) ?? couleurStructure(cfg),
  };
  return texte.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const k = key.toLowerCase();
    return k in map ? map[k] : whole;
  });
}

// Description UNIFIÉE d'une pergola sur-mesure : reprend toujours les mesures
// exactes + la config, puis les descriptions pré-stockées de chaque composant.
// Sert de base éditable sur la ligne unique du devis.
export function construireDescription(
  cfg: ConfigSM,
  descriptions: Record<string, string> = {},
  options: OptionSM[] = OPTIONS,
): string {
  const m = MODELES.find((x) => x.code === cfg.modele) ?? MODELES[0];
  const L = cfg.toitL || 0;
  const W = cfg.toitW || 0;
  const surface = r2(L * W);
  const perimetre = r2((L + W) * 2);
  const sub = (t: string) => injecterTokens(t, cfg);
  // Une description vide ou marquée « manquant » (placeholder à compléter dans
  // Réglages) ne doit pas apparaître sur le devis.
  const reel = (s?: string): string | null => {
    const t = s?.trim();
    return t && t.toLowerCase() !== "manquant" ? t : null;
  };
  const blocs: string[] = [];

  // Kit pergola (toit + poteaux) : si une fiche gamme est pré-stockée, elle sert
  // de bloc principal (tokens remplacés). Sinon, en-tête auto + résumé structure.
  const kitDesc = reel(descriptions[m.code]);
  if (kitDesc) {
    blocs.push(sub(kitDesc));
  } else {
    const dims =
      L > 0 && W > 0
        ? ` — ${fr(L)} × ${fr(W)} m${surface > 0 ? ` (${fr(surface)} m²)` : ""}`
        : "";
    const modules = (cfg.toitQte || 0) > 1 ? ` · ${cfg.toitQte} modules` : "";
    blocs.push(
      `${m.lames ? `Pergola bioclimatique ${m.code}` : `${m.libelle} aluminium`}${dims}${modules}`,
    );

    const struct: string[] = [];
    if ((cfg.poteaux || 0) > 0)
      struct.push(
        `${cfg.poteaux} poteau${cfg.poteaux > 1 ? "x" : ""} (${libellePose(poseDe(cfg), m).toLowerCase()})`,
      );
    if (m.lames && perimetre > 0)
      struct.push(`bandeau LED périmétrique (${fr(perimetre)} m)`);
    if (m.lames && (cfg.eclairage || 0) > 0)
      struct.push(`système d'éclairage ×${cfg.eclairage}`);
    if (struct.length) blocs.push(`Structure : ${struct.join(" · ")}`);
  }

  // Coloris (toujours rappelé : standard ou option ; lames si bicolore).
  const lames = couleurLamesDe(cfg);
  blocs.push(
    `Coloris : ${
      lames ? `structure ${couleurStructure(cfg)} · lames ${lames}` : couleurStructure(cfg)
    } (thermolaquage)`,
  );
  if (m.lames && cfg.ledLames)
    blocs.push(
      `Éclairage : LED intégrées aux lames${(cfg.ledLamesPrix ?? 0) > 0 ? " (en option)" : " (inclus)"}`,
    );

  // Extras (LED / éclairage) si une description est renseignée.
  const ledDesc = reel(descriptions["led"]);
  const eclDesc = reel(descriptions["eclairage"]);
  if (m.lames && perimetre > 0 && ledDesc) blocs.push(sub(ledDesc));
  if (m.lames && (cfg.eclairage || 0) > 0 && eclDesc) blocs.push(sub(eclDesc));

  // Options posées, avec face et dimensions exactes + description pré-stockée.
  const opts: string[] = [];
  for (const el of cfg.elements) {
    const o = options.find((x) => x.id === el.optionId);
    if (!o) continue;
    const d =
      o.type === "unite" ? `×${el.qte}` : `${dimsMM(el.L, el.H)} · ×${el.qte}`;
    const od = reel(descriptions[o.id]);
    const desc = od ? ` — ${sub(od)}` : "";
    opts.push(`• ${o.label}${el.face ? ` (${el.face})` : ""} · ${d}${desc}`);
  }
  if (opts.length) {
    blocs.push("Options :");
    blocs.push(opts.join("\n"));
  }

  return blocs.join("\n");
}

// Ligne UNIQUE : toute la config sur-mesure comptabilisée en un seul produit,
// prix global + description unifiée (mesures exactes incluses). C'est ce qui
// remplace les anciennes présélections.
export function construireLigneUnique(
  cfg: ConfigSM,
  descriptions: Record<string, string> = {},
  options: OptionSM[] = OPTIONS,
): Ligne[] {
  const detail = construireLignes(cfg, descriptions, options);
  const total = r2(detail.reduce((a, l) => a + l.prixHt, 0));
  const m = MODELES.find((x) => x.code === cfg.modele) ?? MODELES[0];
  if (total <= 0) return [];

  const L = cfg.toitL || 0;
  const W = cfg.toitW || 0;
  // Titre normalisé : « Pergola Signature 5x3 (longueur x largeur) ».
  const dims =
    L > 0 && W > 0 ? ` ${fr(L)}x${fr(W)} (longueur x largeur)` : "";

  return [
    {
      designation: `${m.libelle}${dims}${suffixePose(cfg)}`,
      description: construireDescription(cfg, descriptions, options),
      quantite: 1,
      prixHt: total,
      tva: 20,
    },
  ];
}

// Lignes de devis du configurateur : le KIT pergola (toit + poteaux + LED +
// éclairage) en 1 ligne, puis CHAQUE option sur SA PROPRE ligne (visible et
// éditable). Toutes marquées `config` pour un remplacement propre.
export function construireLignesDevis(
  cfg: ConfigSM,
  descriptions: Record<string, string> = {},
  options: OptionSM[] = OPTIONS,
): Ligne[] {
  const m = MODELES.find((x) => x.code === cfg.modele) ?? MODELES[0];
  const L = cfg.toitL || 0;
  const W = cfg.toitW || 0;
  const lignes: Ligne[] = [];

  // 1) Ligne KIT (toit + poteaux + LED + éclairage), options ET couleur exclues
  //    du prix (la couleur a sa propre ligne) mais coloris rappelé dans la description.
  const cfgBase: ConfigSM = { ...cfg, elements: [] };
  const baseTotal = r2(
    construireLignes(
      { ...cfgBase, couleur: null, couleurLames: null, ledLames: false },
      descriptions,
    ).reduce((a, l) => a + l.prixHt, 0),
  );
  if (baseTotal > 0) {
    const dims = L > 0 && W > 0 ? ` ${fr(L)}x${fr(W)} (longueur x largeur)` : "";
    lignes.push({
      designation: `${m.libelle}${dims}${suffixePose(cfg)}`,
      description: construireDescription(cfgBase, descriptions, options),
      quantite: 1,
      prixHt: baseTotal,
      tva: 20,
      config: true,
    });
  }

  // 2) Option couleur (hors teinte standard) : ligne visible même à 0 € (offerte),
  //    comme sur les factures historiques (« OPTION COULEUR RAL 1015 — OFFERT »).
  const couleur = libelleCouleur(cfg);
  if (couleur) {
    const brut = descriptions["couleur"]?.trim();
    lignes.push({
      designation: couleur,
      description:
        brut && brut.toLowerCase() !== "manquant" ? injecterTokens(brut, cfg) : null,
      quantite: 1,
      prixHt: r2(cfg.couleurPrix ?? 0),
      tva: 20,
      config: true,
    });
  }

  // 2 bis) Éclairage LED intégré aux lames : ligne à part s'il est en supplément
  //    (sinon simplement rappelé dans la description du kit).
  const ledLames = m.lames ? prixLedLames(cfg) : 0;
  if (ledLames > 0) {
    const brut = descriptions["led_lames"]?.trim();
    lignes.push({
      designation: LED_LAMES_LABEL,
      description:
        brut && brut.toLowerCase() !== "manquant" ? injecterTokens(brut, cfg) : null,
      quantite: 1,
      prixHt: ledLames,
      tva: 20,
      config: true,
    });
  }

  // 3) Une ligne par option posée (avec sa face, ses dimensions, sa description).
  for (const el of cfg.elements) {
    const o = options.find((x) => x.id === el.optionId);
    if (!o) continue;
    const p = prixOption(o, { qte: el.qte, L: el.L, H: el.H });
    if (p <= 0) continue;
    const dims =
      o.type === "unite" ? `×${el.qte}` : `${dimsMM(el.L, el.H)} · ×${el.qte}`;
    const face = el.face ? ` — ${el.face}` : "";
    const brut = descriptions[o.id]?.trim();
    const desc =
      brut && brut.toLowerCase() !== "manquant" ? injecterTokens(brut, cfg) : null;
    lignes.push({
      designation: `${o.label}${face} (${dims})`,
      description: desc,
      quantite: 1,
      prixHt: p,
      tva: 20,
      config: true,
    });
  }

  return lignes;
}

// ---------------------------------------------------------------------------
// RECONSTRUCTION de la config depuis les lignes d'un devis (devis créés avant la
// persistance de `devis.config`, ou dupliqués depuis l'un d'eux). Le but : que
// « Modifier la pergola » rouvre le configurateur PRÉ-REMPLI au lieu de vide.
// On lit le libellé du kit (gamme, dimensions, autoportée), on retrouve poteaux
// et spots par le prix, puis chaque ligne d'option (face, dimensions, qté).
// ---------------------------------------------------------------------------
export type LigneBrute = { designation: string; prixHt: number; quantite?: number };

// « Pergola Horizon 5x3 (longueur x largeur) — Autoportée » ou l'ancien
// « Pergola HORIZON — toit 5×3 m » : gamme + 2 dimensions.
const KIT_RE = new RegExp(
  `^(?:Pergola\\s+)?(${MODELES.map((m) => m.code).join("|")})\\b\\D*?(\\d+(?:[.,]\\d+)?)\\s*[x×]\\s*(\\d+(?:[.,]\\d+)?)`,
  "i",
);
const OPTION_RE = /^(.*?)(?: — (.*?))? \((?:(\d+) L × (\d+) H mm · )?×(\d+)\)\s*$/;
const COULEUR_RE = /^Option couleur — (.*?)(?: \(offerte\))?\s*$/i;

const num = (s: string) => Number(s.replace(",", "."));

// Kit : retrouve (poteaux, spots) dont le prix colle au mieux au HT de la ligne.
function deduireKit(designation: string, prixHt: number): ConfigSM | null {
  const m = KIT_RE.exec(designation.trim());
  if (!m) return null;
  const modele = MODELES.find((x) => x.code.toLowerCase() === m[1].toLowerCase()) ?? MODELES[0];
  const L = num(m[2]);
  const W = num(m[3]);
  if (!(L > 0 && W > 0)) return null;
  // Pose lue dans le libellé. ATTENTION : les anciens devis affichaient
  // « Autoportée » pour 2 poteaux (bug inversé) → pour eux, le nombre de poteaux
  // retrouvé par le prix fait foi ; « Adossée » n'existe que depuis la correction.
  const adossee = /adoss/i.test(designation);
  const autoportee = !adossee && /autoport/i.test(designation);
  const base: ConfigSM = {
    modele: modele.code,
    toitL: L,
    toitW: W,
    toitQte: 1,
    poteaux: adossee ? 2 : 4,
    eclairage: 0,
    elements: [],
    pose: adossee ? "adossee" : autoportee ? "autoportee" : null,
  };
  if (!(prixHt > 0) || !modele.lames) return { ...base, pose: poseDe(base) };
  // Cherche la combinaison poteaux × spots la plus proche du prix (±1 €).
  let best = { poteaux: base.poteaux, eclairage: 0, ecart: Infinity };
  for (const poteaux of [4, 2, 3, 5, 6, 8]) {
    for (let ecl = 0; ecl <= 12; ecl++) {
      const p = construireLignes({ ...base, poteaux, eclairage: ecl }).reduce(
        (a, l) => a + l.prixHt,
        0,
      );
      const ecart = Math.abs(p - prixHt);
      if (ecart < best.ecart) best = { poteaux, eclairage: ecl, ecart };
    }
  }
  if (best.ecart > 1) return { ...base, pose: poseDe(base) };
  const poteaux = best.poteaux;
  // Libellé explicite « Adossée » → on le garde ; sinon (ancien « Autoportée » ou
  // rien) la pose suit le nombre de poteaux réellement facturés.
  const pose: Pose = adossee ? "adossee" : poteaux <= 2 ? "adossee" : "autoportee";
  return { ...base, poteaux, eclairage: best.eclairage, pose };
}

// Déduit UNE config par kit rencontré (la 1ʳᵉ = pergola principale, les suivantes
// = pergolas supplémentaires) ; les options qui suivent un kit lui sont rattachées.
export function deduireConfigs(lignes: LigneBrute[], options: OptionSM[] = OPTIONS): ConfigSM[] {
  const configs: ConfigSM[] = [];
  let courante: ConfigSM | null = null;
  for (const l of lignes) {
    const d = l.designation.trim();
    const kit = deduireKit(d, l.prixHt);
    if (kit) {
      courante = kit;
      configs.push(kit);
      continue;
    }
    if (!courante) continue;

    const c = COULEUR_RE.exec(d);
    if (c) {
      const inner = c[1].trim();
      const bi = /^structure (.+?) · lames (.+)$/i.exec(inner);
      if (bi) {
        courante.couleur = bi[1].trim();
        courante.couleurLames = bi[2].trim();
      } else if (/^lames /i.test(inner)) courante.couleurLames = inner.replace(/^lames /i, "").trim();
      else courante.couleur = inner;
      courante.couleurPrix = Math.max(0, l.prixHt || 0);
      continue;
    }
    if (d.toLowerCase().startsWith(LED_LAMES_LABEL.toLowerCase())) {
      courante.ledLames = true;
      courante.ledLamesPrix = Math.max(0, l.prixHt || 0);
      continue;
    }

    const o = OPTION_RE.exec(d);
    if (!o) continue;
    const opt = options.find((x) => x.label.toLowerCase() === o[1].trim().toLowerCase());
    if (!opt) continue;
    courante.elements.push({
      optionId: opt.id,
      face: o[2]?.trim() || FACES[0],
      L: o[3] ? Number(o[3]) / 1000 : 0,
      H: o[4] ? Number(o[4]) / 1000 : 0,
      qte: Number(o[5]) || 1,
    });
  }
  return configs;
}
