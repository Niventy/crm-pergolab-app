"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { leads } from "@/db/schema";

function revalidate() {
  revalidatePath("/liste");
  revalidatePath("/kanban");
  revalidatePath("/dashboard");
}

// Supprime définitivement un lead (notes / échanges / devis suivent en cascade).
export async function deleteLead(id: string) {
  await db.delete(leads).where(eq(leads.id, id));
  revalidate();
  return { ok: true };
}

// Supprime plusieurs leads d'un coup.
export async function deleteLeads(ids: string[]) {
  if (ids.length === 0) return { ok: true, count: 0 };
  await db.delete(leads).where(inArray(leads.id, ids));
  revalidate();
  return { ok: true, count: ids.length };
}
