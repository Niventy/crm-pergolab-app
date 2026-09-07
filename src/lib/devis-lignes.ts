// Comparaison de deux jeux de lignes de devis (CRM ↔ Pennylane) : mêmes
// libellés, quantités, prix HT et taux, quel que soit l'ordre. La clause
// suspensive (0 €, ajoutée automatiquement) est ignorée. Module PUR : utilisé
// côté serveur (vérification après enregistrement) et côté client (éditeur).
export type LigneComparable = {
  designation: string;
  quantite: number;
  prixHt: number;
  tva: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export const estClauseLigne = (l: { designation: string }) =>
  l.designation.trim().toLowerCase().startsWith("clause suspensive");

// Empreinte triée d'un jeu de lignes (une entrée par ligne « métier »).
export function signatureLignes(lignes: LigneComparable[]): string[] {
  return lignes
    .filter((l) => l.designation.trim() && !estClauseLigne(l))
    .map(
      (l) =>
        `${l.designation.trim().toLowerCase()}|${l.quantite || 1}|${r2(l.prixHt || 0)}|${
          l.tva ?? 20
        }`,
    )
    .sort();
}

export function memeLignes(a: LigneComparable[], b: LigneComparable[]): boolean {
  const x = signatureLignes(a);
  const y = signatureLignes(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
}
