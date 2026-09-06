"use server";

import { and, or, ilike, isNull } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";

export type SearchResult = {
  id: string;
  nom: string;
  statut: string;
  entreprise: string | null;
  codePostal: string | null;
  stageNom: string | null;
  stageCouleur: string | null;
};

// Recherche un prospect/client par nom, email, téléphone, code postal ou entreprise.
export async function searchLeads(term: string): Promise<SearchResult[]> {
  const q = term.trim();
  if (q.length < 2) return [];
  const like = `%${q}%`;

  const rows = await db.query.leads.findMany({
    where: and(
      isNull(leads.deletedAt),
      or(
        ilike(leads.nom, like),
        ilike(leads.email, like),
        ilike(leads.telephone, like),
        ilike(leads.codePostal, like),
        ilike(leads.entreprise, like),
      ),
    ),
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
    stageNom: r.stage?.nom ?? null,
    stageCouleur: r.stage?.couleur ?? null,
  }));
}
