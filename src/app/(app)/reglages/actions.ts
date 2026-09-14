"use server";

import { revalidatePath } from "next/cache";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { surMesureMapping, produitsCatalogue, optionsConfigurateur } from "@/db/schema";
import {
  OPTIONS,
  type OptionSM,
  type OptionType,
} from "@/app/(app)/leads/[id]/devis/[devisId]/sur-mesure";

// (L'ancien mapping composant → produit Pennylane a été retiré : le catalogue
// interne `produits_catalogue` l'a remplacé.)

// Descriptions pré-stockées : composant du configurateur → texte injecté sur la ligne.
export async function getDescriptionsSurMesure(): Promise<
  Record<string, string>
> {
  const rows = await db.select().from(surMesureMapping);
  const map: Record<string, string> = {};
  for (const r of rows) if (r.description) map[r.composant] = r.description;
  return map;
}

// Définit (ou efface) la description d'un composant. Ouvert à toute l'équipe
// (textes commerciaux du devis), comme le catalogue produits.
export async function setDescriptionSurMesure(
  composant: string,
  description: string | null,
) {
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
// ---------------------------------------------------------------------------
// Options du configurateur (stores, persiennes, murs, chauffage…). Ouvert à
// toute l'équipe, comme les descriptions : c'est l'offre commerciale du devis.
// ---------------------------------------------------------------------------
export type OptionConfigurateurInput = {
  label: string;
  type: OptionType;
  prix: number;
  forfait?: number | null;
  defLmm?: number | null; // largeur par défaut en mm (stockée en m)
  defHmm?: number | null;
  position?: number;
};

const versOptionSM = (r: typeof optionsConfigurateur.$inferSelect): OptionSM => ({
  id: r.id,
  label: r.label,
  type: (["surface", "surface_forfait", "unite"].includes(r.type) ? r.type : "surface") as OptionType,
  prix: Number(r.prix ?? 0),
  forfait: r.forfait != null ? Number(r.forfait) : undefined,
  defL: r.defL != null ? Number(r.defL) : undefined,
  defH: r.defH != null ? Number(r.defH) : undefined,
  actif: r.actif,
});

// Liste des options (actives par défaut ; `tousLesEtats` = retirées incluses).
// Table vide (avant amorçage) → liste codée par défaut.
export async function getOptionsConfigurateur(tousLesEtats = false): Promise<OptionSM[]> {
  const rows = await db
    .select()
    .from(optionsConfigurateur)
    .orderBy(asc(optionsConfigurateur.position), asc(optionsConfigurateur.label));
  if (rows.length === 0) return OPTIONS.map((o) => ({ ...o, actif: true }));
  return rows.filter((r) => tousLesEtats || r.actif).map(versOptionSM);
}

// Slug stable depuis le libellé (« Store Motorisé » → « store_motorise »), unique.
async function slugOption(label: string): Promise<string> {
  const base =
    label
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "option";
  const existants = new Set(
    (await db.select({ id: optionsConfigurateur.id }).from(optionsConfigurateur)).map((r) => r.id),
  );
  if (!existants.has(base)) return base;
  for (let i = 2; i < 1000; i++) if (!existants.has(`${base}_${i}`)) return `${base}_${i}`;
  return `${base}_${Date.now()}`;
}

function validerOption(data: OptionConfigurateurInput): string | null {
  if (!data.label?.trim()) return "Le libellé est obligatoire.";
  if (!["surface", "surface_forfait", "unite"].includes(data.type)) return "Type invalide.";
  if (!(Number(data.prix) >= 0)) return "Le prix doit être un nombre positif ou nul.";
  if (data.type === "surface_forfait" && !(Number(data.forfait ?? 0) >= 0))
    return "Le forfait doit être un nombre positif ou nul.";
  return null;
}

const valeursOption = (data: OptionConfigurateurInput) => ({
  label: data.label.trim(),
  type: data.type,
  prix: String(Number(data.prix) || 0),
  forfait: data.type === "surface_forfait" ? String(Number(data.forfait ?? 0) || 0) : null,
  defL: data.type === "unite" || !data.defLmm ? null : String(Number(data.defLmm) / 1000),
  defH: data.type === "unite" || !data.defHmm ? null : String(Number(data.defHmm) / 1000),
  ...(data.position != null ? { position: Math.trunc(Number(data.position) || 0) } : {}),
});

// Ajoute une option (proposée immédiatement dans le configurateur).
export async function addOptionConfigurateur(data: OptionConfigurateurInput) {
  const err = validerOption(data);
  if (err) return { ok: false as const, error: err };
  // Amorçage tardif : si la table est encore vide, on y copie d'abord les
  // options par défaut pour ne pas les perdre à la 1ʳᵉ option ajoutée.
  const [n] = await db.select({ id: optionsConfigurateur.id }).from(optionsConfigurateur).limit(1);
  if (!n)
    await db.insert(optionsConfigurateur).values(
      OPTIONS.map((o, i) => ({
        id: o.id,
        label: o.label,
        type: o.type,
        prix: String(o.prix),
        forfait: o.forfait != null ? String(o.forfait) : null,
        defL: o.defL != null ? String(o.defL) : null,
        defH: o.defH != null ? String(o.defH) : null,
        position: (i + 1) * 10,
        actif: true,
      })),
    );
  const id = await slugOption(data.label);
  const [max] = await db
    .select({ m: sql<number>`coalesce(max(${optionsConfigurateur.position}), 0)` })
    .from(optionsConfigurateur);
  await db.insert(optionsConfigurateur).values({
    id,
    ...valeursOption(data),
    position: data.position ?? Number(max?.m ?? 0) + 10,
    actif: true,
  });
  revalidatePath("/reglages/options");
  revalidatePath("/reglages/sur-mesure");
  return { ok: true as const, error: null, id };
}

// Modifie une option (le slug ne change pas : les devis existants y font référence).
export async function updateOptionConfigurateur(id: string, data: OptionConfigurateurInput) {
  const err = validerOption(data);
  if (err) return { ok: false as const, error: err };
  await db.update(optionsConfigurateur).set(valeursOption(data)).where(eq(optionsConfigurateur.id, id));
  revalidatePath("/reglages/options");
  revalidatePath("/reglages/sur-mesure");
  return { ok: true as const, error: null };
}

// Retire (actif = false) ou réactive une option. On ne supprime pas la ligne :
// les devis déjà composés référencent son id et doivent pouvoir se rouvrir.
export async function setOptionConfigurateurActive(id: string, actif: boolean) {
  await db.update(optionsConfigurateur).set({ actif }).where(eq(optionsConfigurateur.id, id));
  revalidatePath("/reglages/options");
  revalidatePath("/reglages/sur-mesure");
  return { ok: true as const, error: null };
}

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

// Crée un produit. Ouvert à toute l'équipe.
export async function addProduitCatalogue(data: ProduitInput) {
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

// Met à jour un produit. Ouvert à toute l'équipe.
export async function updateProduitCatalogue(id: string, data: ProduitInput) {
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

// Supprime un produit. Ouvert à toute l'équipe (confirmation côté interface).
export async function deleteProduitCatalogue(id: string) {
  await db.delete(produitsCatalogue).where(eq(produitsCatalogue.id, id));
  revalidatePath("/reglages/produits");
  return { ok: true as const, error: null };
}
