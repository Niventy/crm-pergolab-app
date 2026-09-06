// Calculs partagés devis / facturation (client ET serveur, aucune dépendance).
// Règle d'or : la TVA se calcule LIGNE PAR LIGNE, au taux de chaque ligne.
// Tout montant TTC (devis, acompte, solde, reste à encaisser) découle d'ici.

export type LigneCalc = {
  designation: string;
  quantite: number;
  prixHt: number;
  tva: number; // en % (20, 10, 5.5, 0)
  remisePct?: number | null; // remise en % sur la ligne
};

// Taux de TVA proposés dans le CRM (source unique : devis + catalogue).
// Pennylane n'a pas de 0 % « FR_… » : le 0 % est envoyé en `exempt`.
export const TVA_OPTIONS = [20, 10, 5.5, 0] as const;

export const r2 = (n: number) => Math.round(n * 100) / 100;

// HT d'une ligne, remise (%) déduite.
export function ligneHt(l: LigneCalc): number {
  const brut = (l.quantite || 0) * (l.prixHt || 0);
  const r = Number(l.remisePct ?? 0);
  return r > 0 ? brut * (1 - r / 100) : brut;
}

export function totalHt(lines: LigneCalc[]): number {
  return r2(lines.reduce((a, l) => a + ligneHt(l), 0));
}

// TTC = Σ HT_ligne × (1 + taux_ligne). Les lignes négatives (remise) réduisent
// la TVA à LEUR taux, ce qui garde le total juste quand les taux diffèrent.
export function totalTtc(lines: LigneCalc[]): number {
  return r2(lines.reduce((a, l) => a + ligneHt(l) * (1 + (l.tva || 0) / 100), 0));
}

export function totalTva(lines: LigneCalc[]): number {
  return r2(totalTtc(lines) - totalHt(lines));
}

// Net HT réparti PAR TAUX de TVA (remises comprises, car elles portent un taux).
export function netParTaux(lines: LigneCalc[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const l of lines) {
    const t = l.tva || 0;
    m.set(t, (m.get(t) ?? 0) + ligneHt(l));
  }
  // On ne garde que les taux dont la base est positive (une remise seule n'a pas de sens).
  for (const [t, v] of m) if (v <= 0.005) m.delete(t);
  return m;
}

export type LigneFacture = {
  designation: string;
  quantite: 1;
  prixHt: number;
  tva: number;
};

// Répartit un montant TTC (ex. acompte de 40 %) sur les taux du devis, au
// PRORATA de la base de chaque taux. Renvoie une ligne HT par taux, arrondie au
// centime, puis corrige la plus grosse ligne pour retomber sur le TTC visé.
export function repartirTtcParTaux(
  base: Map<number, number>, // taux → HT restant à facturer pour ce taux
  ttcCible: number,
  libelle: (taux: number, multi: boolean) => string,
): LigneFacture[] {
  const ttcBase = [...base.entries()].reduce(
    (a, [t, ht]) => a + ht * (1 + t / 100),
    0,
  );
  if (ttcBase <= 0 || ttcCible <= 0) return [];
  const ratio = Math.min(1, ttcCible / ttcBase);
  const multi = base.size > 1;
  const lignes: LigneFacture[] = [...base.entries()].map(([t, ht]) => ({
    designation: libelle(t, multi),
    quantite: 1,
    prixHt: r2(ht * ratio),
    tva: t,
  }));
  // Écart d'arrondi → absorbé par la ligne la plus grosse (au centime HT près).
  const ttcObtenu = lignes.reduce((a, l) => a + l.prixHt * (1 + l.tva / 100), 0);
  const ecart = r2(Math.min(ttcCible, ttcBase)) - r2(ttcObtenu);
  if (Math.abs(ecart) >= 0.005 && lignes.length) {
    const grosse = lignes.reduce((a, b) => (b.prixHt > a.prixHt ? b : a));
    grosse.prixHt = r2(grosse.prixHt + ecart / (1 + grosse.tva / 100));
  }
  return lignes.filter((l) => l.prixHt > 0);
}

// Base restante par taux après les factures déjà émises (leurs lignes par taux).
export function resteParTaux(
  devisLines: LigneCalc[],
  factures: { lignes: LigneFacture[] }[],
): Map<number, number> {
  const reste = netParTaux(devisLines);
  for (const f of factures)
    for (const l of f.lignes ?? []) {
      const t = l.tva || 0;
      if (reste.has(t)) reste.set(t, r2((reste.get(t) ?? 0) - l.prixHt));
    }
  for (const [t, v] of reste) if (v <= 0.005) reste.delete(t);
  return reste;
}

export function ttcDeLignesFacture(lignes: LigneFacture[]): number {
  return r2(lignes.reduce((a, l) => a + l.prixHt * (1 + l.tva / 100), 0));
}

export function htDeLignesFacture(lignes: LigneFacture[]): number {
  return r2(lignes.reduce((a, l) => a + l.prixHt, 0));
}

// Taux « dominant » d'un devis (le plus gros HT) → TVA par défaut à la réouverture.
export function tauxDominant(lines: LigneCalc[], defaut = 20): number {
  let best = defaut;
  let max = -1;
  for (const [t, ht] of netParTaux(lines)) {
    if (ht > max) {
      max = ht;
      best = t;
    }
  }
  return best;
}

// Libellé « 10 % » / « 5,5 % » à la française.
export const tauxLabel = (t: number) => `${String(t).replace(".", ",")} %`;
