"use server";

import { and, or, ilike, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";

export type SearchResult = {
  id: string;
  nom: string;
  statut: string;
  entreprise: string | null;
  codePostal: string | null;
  telephone: string | null;
  stageNom: string | null;
  stageCouleur: string | null;
};

// Chiffres d'un numéro tel qu'il est comparé en base : tout sauf les chiffres
// retiré, indicatif « 0033 » / « 33 » ramené au « 0 » national. Même règle que
// le dédoublonnage du webhook Meta (`api/leads/inbound`).
function chiffresTel(v: string): string {
  return v.replace(/\D/g, "").replace(/^0033/, "0").replace(/^33/, "0");
}

// Expression SQL : téléphone stocké réduit à ses chiffres, indicatif normalisé.
const telChiffresSql = sql`regexp_replace(regexp_replace(regexp_replace(coalesce(${leads.telephone}, ''), '\D', '', 'g'), '^0033', '0'), '^33', '0')`;

// Recherche un prospect/client par nom, email, téléphone, code postal ou entreprise.
// Le téléphone se cherche sur ses CHIFFRES : « 06 58 24 », « 0658243361 »,
// « +33 6 58 24 33 61 » ou « 06.58.24 » trouvent la même fiche, quel que soit
// le format enregistré.
export async function searchLeads(term: string): Promise<SearchResult[]> {
  const q = term.trim();
  if (q.length < 2) return [];
  const like = `%${q}%`;

  const criteres: SQL[] = [
    ilike(leads.nom, like),
    ilike(leads.email, like),
    ilike(leads.telephone, like),
    ilike(leads.codePostal, like),
    ilike(leads.entreprise, like),
  ];

  // Saisie « numéro de téléphone » (chiffres, +, espaces, points, tirets,
  // parenthèses) avec au moins 3 chiffres → correspondance sur les chiffres.
  const ressembleTel = /^[\d\s+().-]+$/.test(q);
  const digits = chiffresTel(q);
  if (ressembleTel && digits.length >= 3) {
    criteres.push(sql`${telChiffresSql} like ${`%${digits}%`}`);
  }

  const rows = await db.query.leads.findMany({
    where: and(isNull(leads.deletedAt), or(...criteres)),
    with: { stage: true },
    orderBy: (l, { desc }) => [desc(l.createdAt)],
    limit: 8,
  });

  return rows.map((r) => ({
    id: r.id,
    nom: r.nom,
    statut: r.statut,
    entreprise: r.entreprise,
    codePostal: r.codePostal,
    telephone: r.telephone,
    stageNom: r.stage?.nom ?? null,
    stageCouleur: r.stage?.couleur ?? null,
  }));
}
