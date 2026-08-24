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
  prixToit: number; // €/m²
  prixPoteau: number; // €/pièce
};

// Seuls le toit et les poteaux changent selon le modèle (le reste est identique).
// Gammes commerciales : ESSENTIA (140U) / HORIZON (175U) / SIGNATURE (220).
export const MODELES: Modele[] = [
  { code: "ESSENTIA", prixToit: 521.5, prixPoteau: 262.5 },
  { code: "HORIZON", prixToit: 588, prixPoteau: 325.5 },
  { code: "SIGNATURE", prixToit: 707, prixPoteau: 392 },
];

export const PRIX_LED = 28; // €/m de périmètre
export const PRIX_ECLAIRAGE = 297.5; // €/unité (Lighting Control System)

export type OptionType = "surface" | "surface_forfait" | "unite";

export type OptionSM = {
  id: string;
  label: string;
  type: OptionType;
  prix: number;
  forfait?: number; // pour surface_forfait
  defL?: number; // largeur par défaut (m)
  defH?: number; // hauteur par défaut (m)
};

export const OPTIONS: OptionSM[] = [
  { id: "sheer", label: "Rideaux voile", type: "surface", prix: 50.75, defL: 4.63, defH: 2.33 },
  { id: "zip", label: "Store Motorisé", type: "surface_forfait", prix: 189, forfait: 255.5, defL: 4.76, defH: 2.33 },
  { id: "baie", label: "Baie vitrée coulissante", type: "surface", prix: 413, defL: 2.76, defH: 2.33 },
  { id: "volet_fixe", label: "Volet alu fixe", type: "surface", prix: 420, defL: 4.63, defH: 2.33 },
  { id: "volet_coul", label: "Volet alu coulissant", type: "surface", prix: 476, defL: 4.63, defH: 2.33 },
  { id: "volet_pliant", label: "Volet alu pliant (bi-folding)", type: "surface", prix: 518, defL: 4.63, defH: 2.33 },
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

export type ConfigSM = {
  modele: string;
  toitL: number; // largeur (m)
  toitW: number; // avancée (m)
  toitQte: number;
  poteaux: number;
  eclairage: number; // qté du système d'éclairage
  elements: Element[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

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
export const COMPOSANTS: { id: string; label: string }[] = [
  ...MODELES.map((m) => ({
    id: m.code,
    label: `Pergola ${m.code} (kit toit + poteaux)`,
  })),
  { id: "led", label: "Bandeau LED" },
  { id: "eclairage", label: "Système d'éclairage" },
  ...OPTIONS.map((o) => ({ id: o.id, label: o.label })),
];

// Construit les lignes de devis détaillées à partir de la config.
// `descriptions` : id de composant → description pré-stockée (injectée sur la ligne
// et affichée dans le CRM / sur le devis).
export function construireLignes(
  cfg: ConfigSM,
  descriptions: Record<string, string> = {},
): Ligne[] {
  const m = MODELES.find((x) => x.code === cfg.modele) ?? MODELES[0];
  const lignes: Ligne[] = [];
  const L = cfg.toitL || 0;
  const W = cfg.toitW || 0;

  // Toit
  const toit = r2(m.prixToit * L * W * (cfg.toitQte || 0));
  if (toit > 0)
    lignes.push({
      designation: `Pergola ${m.code} — toit ${L}×${W} m`,
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

  // LED (périmètre)
  const perimetre = r2((L + W) * 2);
  const led = r2(perimetre * PRIX_LED);
  if (led > 0)
    lignes.push({
      designation: `Bandeau LED (${perimetre} m de périmètre)`,
      description: descriptions["led"] || null,
      quantite: 1,
      prixHt: led,
      tva: 20,
    });

  // Système d'éclairage
  const ecl = r2((cfg.eclairage || 0) * PRIX_ECLAIRAGE);
  if (ecl > 0)
    lignes.push({
      designation: `Système d'éclairage (×${cfg.eclairage})`,
      description: descriptions["eclairage"] || null,
      quantite: 1,
      prixHt: ecl,
      tva: 20,
    });

  // Éléments (options posées, avec leur face)
  for (const el of cfg.elements) {
    const o = OPTIONS.find((x) => x.id === el.optionId);
    if (!o) continue;
    const p = prixOption(o, { qte: el.qte, L: el.L, H: el.H });
    if (p <= 0) continue;
    const dims =
      o.type === "unite" ? `×${el.qte}` : `${el.L}×${el.H} m · ×${el.qte}`;
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
    blocs.push(`Pergola bioclimatique ${m.code}${dims}${modules}`);

    const struct: string[] = [];
    if ((cfg.poteaux || 0) > 0)
      struct.push(`${cfg.poteaux} poteau${cfg.poteaux > 1 ? "x" : ""}`);
    if (perimetre > 0)
      struct.push(`bandeau LED périmétrique (${fr(perimetre)} m)`);
    if ((cfg.eclairage || 0) > 0)
      struct.push(`système d'éclairage ×${cfg.eclairage}`);
    if (struct.length) blocs.push(`Structure : ${struct.join(" · ")}`);
  }

  // Extras (LED / éclairage) si une description est renseignée.
  const ledDesc = reel(descriptions["led"]);
  const eclDesc = reel(descriptions["eclairage"]);
  if (perimetre > 0 && ledDesc) blocs.push(sub(ledDesc));
  if ((cfg.eclairage || 0) > 0 && eclDesc) blocs.push(sub(eclDesc));

  // Options posées, avec face et dimensions exactes + description pré-stockée.
  const opts: string[] = [];
  for (const el of cfg.elements) {
    const o = OPTIONS.find((x) => x.id === el.optionId);
    if (!o) continue;
    const d =
      o.type === "unite"
        ? `×${el.qte}`
        : `${fr(el.L)} × ${fr(el.H)} m · ×${el.qte}`;
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
): Ligne[] {
  const detail = construireLignes(cfg, descriptions);
  const total = r2(detail.reduce((a, l) => a + l.prixHt, 0));
  if (total <= 0) return [];

  const m = MODELES.find((x) => x.code === cfg.modele) ?? MODELES[0];
  const L = cfg.toitL || 0;
  const W = cfg.toitW || 0;
  // Titre normalisé : « Pergola Signature 5x3 (longueur x largeur) ».
  const gamme = m.code.charAt(0) + m.code.slice(1).toLowerCase();
  const dims =
    L > 0 && W > 0 ? ` ${fr(L)}x${fr(W)} (longueur x largeur)` : "";

  return [
    {
      designation: `Pergola ${gamme}${dims}`,
      description: construireDescription(cfg, descriptions),
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
): Ligne[] {
  const m = MODELES.find((x) => x.code === cfg.modele) ?? MODELES[0];
  const L = cfg.toitL || 0;
  const W = cfg.toitW || 0;
  const lignes: Ligne[] = [];

  // 1) Ligne KIT (toit + poteaux + LED + éclairage), options exclues.
  const cfgBase: ConfigSM = { ...cfg, elements: [] };
  const baseTotal = r2(
    construireLignes(cfgBase, descriptions).reduce((a, l) => a + l.prixHt, 0),
  );
  if (baseTotal > 0) {
    const gamme = m.code.charAt(0) + m.code.slice(1).toLowerCase();
    const dims = L > 0 && W > 0 ? ` ${fr(L)}x${fr(W)} (longueur x largeur)` : "";
    lignes.push({
      designation: `Pergola ${gamme}${dims}`,
      description: construireDescription(cfgBase, descriptions),
      quantite: 1,
      prixHt: baseTotal,
      tva: 20,
      config: true,
    });
  }

  // 2) Une ligne par option posée (avec sa face, ses dimensions, sa description).
  for (const el of cfg.elements) {
    const o = OPTIONS.find((x) => x.id === el.optionId);
    if (!o) continue;
    const p = prixOption(o, { qte: el.qte, L: el.L, H: el.H });
    if (p <= 0) continue;
    const dims =
      o.type === "unite" ? `×${el.qte}` : `${fr(el.L)} × ${fr(el.H)} m · ×${el.qte}`;
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
