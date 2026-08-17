"use server";

import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { surMesureMapping, produitsCatalogue } from "@/db/schema";
import { isAdmin } from "@/lib/current-user";
import { listProduitsPennylane } from "@/lib/pennylane";

// Mapping actuel : composant du configurateur → id produit Pennylane.
export async function getMappingSurMesure(): Promise<Record<string, string>> {
  const rows = await db.select().from(surMesureMapping);
  const map: Record<string, string> = {};
  for (const r of rows) if (r.productId) map[r.composant] = r.productId;
  return map;
}

// Définit (ou efface) la correspondance d'un composant. Réservé aux admins.
export async function setMappingSurMesure(
  composant: string,
  productId: string | null,
) {
  if (!(await isAdmin()))
    return { ok: false as const, error: "Réservé aux admins." };

  await db
    .insert(surMesureMapping)
    .values({ composant, productId: productId || null })
    .onConflictDoUpdate({
      target: surMesureMapping.composant,
      set: { productId: productId || null },
    });

  revalidatePath("/reglages/sur-mesure");
  return { ok: true as const, error: null };
}

// Catalogue Pennylane pour alimenter les menus déroulants du mapping.
export async function fetchProduitsReglages() {
  return listProduitsPennylane();
}

// Descriptions pré-stockées : composant du configurateur → texte injecté sur la ligne.
export async function getDescriptionsSurMesure(): Promise<
  Record<string, string>
> {
  const rows = await db.select().from(surMesureMapping);
  const map: Record<string, string> = {};
  for (const r of rows) if (r.description) map[r.composant] = r.description;
  return map;
}

// Définit (ou efface) la description d'un composant. Réservé aux admins.
export async function setDescriptionSurMesure(
  composant: string,
  description: string | null,
) {
  if (!(await isAdmin()))
    return { ok: false as const, error: "Réservé aux admins." };

  const desc = description?.trim() || null;
  await db
    .insert(surMesureMapping)
    .values({ composant, description: desc })
    .onConflictDoUpdate({
      target: surMesureMapping.composant,
      set: { description: desc },
    });

  revalidatePath("/reglages/sur-mesure");
  return { ok: true as const, error: null };
}

// ---------------------------------------------------------------------------
// Catalogue de produits/options (ajoutables directement en ligne de devis)
// ---------------------------------------------------------------------------
export type ProduitCatalogueDTO = {
  id: string;
  nom: string;
  description: string | null;
  prixHt: number;
  tva: number;
  categorie: string | null;
  actif: boolean;
};

// Liste du catalogue (tous les utilisateurs — sert au menu du devis).
// `tousLesEtats` = inclut aussi les produits désactivés (écran Réglages).
export async function getProduitsCatalogue(
  tousLesEtats = false,
): Promise<ProduitCatalogueDTO[]> {
  const rows = await db
    .select()
    .from(produitsCatalogue)
    .orderBy(asc(produitsCatalogue.position), asc(produitsCatalogue.nom));
  return rows
    .filter((r) => tousLesEtats || r.actif)
    .map((r) => ({
      id: r.id,
      nom: r.nom,
      description: r.description,
      prixHt: Number(r.prixHt ?? 0),
      tva: Number(r.tva ?? 20),
      categorie: r.categorie,
      actif: r.actif,
    }));
}

type ProduitInput = {
  nom: string;
  description?: string | null;
  prixHt?: number | null;
  tva?: number | null;
  categorie?: string | null;
  actif?: boolean;
};

// Crée un produit. Réservé aux admins.
export async function addProduitCatalogue(data: ProduitInput) {
  if (!(await isAdmin()))
    return { ok: false as const, error: "Réservé aux admins." };
  if (!data.nom?.trim())
    return { ok: false as const, error: "Le nom est obligatoire." };

  const [row] = await db
    .insert(produitsCatalogue)
    .values({
      nom: data.nom.trim(),
      description: data.description?.trim() || null,
      prixHt: data.prixHt != null ? String(data.prixHt) : null,
      tva: String(data.tva ?? 20),
      categorie: data.categorie?.trim() || null,
      actif: data.actif ?? true,
    })
    .returning({ id: produitsCatalogue.id });

  revalidatePath("/reglages/produits");
  return { ok: true as const, error: null, id: row.id };
}

// Met à jour un produit. Réservé aux admins.
export async function updateProduitCatalogue(id: string, data: ProduitInput) {
  if (!(await isAdmin()))
    return { ok: false as const, error: "Réservé aux admins." };

  await db
    .update(produitsCatalogue)
    .set({
      nom: data.nom.trim(),
      description: data.description?.trim() || null,
      prixHt: data.prixHt != null ? String(data.prixHt) : null,
      tva: String(data.tva ?? 20),
      categorie: data.categorie?.trim() || null,
      actif: data.actif ?? true,
    })
    .where(eq(produitsCatalogue.id, id));

  revalidatePath("/reglages/produits");
  return { ok: true as const, error: null };
}

// Supprime un produit. Réservé aux admins.
export async function deleteProduitCatalogue(id: string) {
  if (!(await isAdmin()))
    return { ok: false as const, error: "Réservé aux admins." };

  await db.delete(produitsCatalogue).where(eq(produitsCatalogue.id, id));
  revalidatePath("/reglages/produits");
  return { ok: true as const, error: null };
}
