// Moteur de prix sur-mesure — transcription fidèle du classeur
// « Price Calculation HT VENDEUR » (feuilles E140U / E175U / E220).
// Tous les prix sont en HT vendeur.

export type Ligne = {
  designation: string;
  quantite: number;
  prixHt: number;
  tva: number;
  productId?: number | null;
};

export type Modele = {
  code: string;
  prixToit: number; // €/m²
  prixPoteau: number; // €/pièce
};

// Seuls le toit et les poteaux changent selon le modèle (le reste est identique).
export const MODELES: Modele[] = [
  { code: "E140U", prixToit: 521.5, prixPoteau: 262.5 },
  { code: "E175U", prixToit: 588, prixPoteau: 325.5 },
  { code: "E220", prixToit: 707, prixPoteau: 392 },
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
  { id: "zip", label: "Screen zip motorisé", type: "surface_forfait", prix: 189, forfait: 255.5, defL: 4.76, defH: 2.33 },
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

// Construit les lignes de devis détaillées à partir de la config.
// `mapping` : id d'option du configurateur → id produit Pennylane (pour lier la
// ligne au catalogue → sa description remonte sur le devis).
export function construireLignes(
  cfg: ConfigSM,
  mapping: Record<string, number | null> = {},
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
      quantite: 1,
      prixHt: toit,
      tva: 20,
    });

  // Poteaux
  const poteaux = r2((cfg.poteaux || 0) * m.prixPoteau);
  if (poteaux > 0)
    lignes.push({
      designation: `Poteaux ${m.code} (×${cfg.poteaux})`,
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
      quantite: 1,
      prixHt: led,
      tva: 20,
    });

  // Système d'éclairage
  const ecl = r2((cfg.eclairage || 0) * PRIX_ECLAIRAGE);
  if (ecl > 0)
    lignes.push({
      designation: `Système d'éclairage (×${cfg.eclairage})`,
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
      quantite: 1,
      prixHt: p,
      tva: 20,
      productId: mapping[o.id] ?? null, // lie au produit Pennylane → description
    });
  }

  return lignes;
}
