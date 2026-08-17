"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { surMesureMapping } from "@/db/schema";
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
