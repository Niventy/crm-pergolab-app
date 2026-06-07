"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { leads } from "@/db/schema";

// Supprime définitivement un lead (notes / échanges / devis suivent en cascade).
export async function deleteLead(id: string) {
  await db.delete(leads).where(eq(leads.id, id));
  revalidatePath("/liste");
  revalidatePath("/kanban");
  revalidatePath("/dashboard");
  return { ok: true };
}
