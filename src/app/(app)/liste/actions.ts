"use server";

import { inArray, isNotNull, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { leads, echanges } from "@/db/schema";
import { currentUserId, isAdmin } from "@/lib/current-user";

function revalidate() {
  revalidatePath("/liste");
  revalidatePath("/kanban");
  revalidatePath("/dashboard");
  revalidatePath("/clients", "layout");
  revalidatePath("/devis");
}

const REFUS = { ok: false as const, error: "Réservé aux admins.", count: 0 };

// Met des leads à la CORBEILLE (soft delete) : masqués partout, restaurables.
// Réservé aux admins — une suppression était possible par n'importe quel membre,
// définitive et en masse.
export async function deleteLeads(ids: string[]) {
  if (!(await isAdmin())) return REFUS;
  if (ids.length === 0) return { ok: true as const, error: null, count: 0 };
  const userId = await currentUserId();
  await db
    .update(leads)
    .set({ deletedAt: new Date(), updatedAt: new Date(), updatedBy: userId })
    .where(inArray(leads.id, ids));
  await db.insert(echanges).values(
    ids.map((leadId) => ({ leadId, userId, type: "suppression", contenu: "Mis à la corbeille" })),
  );
  revalidate();
  return { ok: true as const, error: null, count: ids.length };
}

export async function deleteLead(id: string) {
  return deleteLeads([id]);
}

// Restaure des leads depuis la corbeille.
export async function restoreLeads(ids: string[]) {
  if (!(await isAdmin())) return REFUS;
  if (ids.length === 0) return { ok: true as const, error: null, count: 0 };
  const userId = await currentUserId();
  await db
    .update(leads)
    .set({ deletedAt: null, updatedAt: new Date(), updatedBy: userId })
    .where(inArray(leads.id, ids));
  await db.insert(echanges).values(
    ids.map((leadId) => ({ leadId, userId, type: "restauration", contenu: "Restauré depuis la corbeille" })),
  );
  revalidate();
  return { ok: true as const, error: null, count: ids.length };
}

// Suppression DÉFINITIVE (uniquement depuis la corbeille) : notes / échanges /
// devis / factures / documents suivent en cascade.
export async function purgeLeads(ids: string[]) {
  if (!(await isAdmin())) return REFUS;
  if (ids.length === 0) return { ok: true as const, error: null, count: 0 };
  await db
    .delete(leads)
    .where(and(inArray(leads.id, ids), isNotNull(leads.deletedAt)));
  revalidate();
  return { ok: true as const, error: null, count: ids.length };
}

export async function restoreLead(id: string) {
  return restoreLeads([id]);
}

// Suppression définitive unitaire d'une fiche déjà en corbeille.
export async function purgeLead(id: string) {
  return purgeLeads([id]);
}
