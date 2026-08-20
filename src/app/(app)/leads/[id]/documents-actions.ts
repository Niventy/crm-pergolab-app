"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { currentUserId } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "documents";
const MAX = 25 * 1024 * 1024; // 25 Mo

// Dépose un fichier dans le bucket + enregistre ses métadonnées.
export async function uploadDocument(leadId: string, formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { ok: false as const, error: "Fichier vide." };
  if (file.size > MAX)
    return { ok: false as const, error: "Fichier trop volumineux (max 25 Mo)." };

  const sb = await createClient();
  const safe = file.name.normalize("NFKD").replace(/[^\w.\-]+/g, "_");
  const chemin = `${leadId}/${crypto.randomUUID()}-${safe}`;

  const { error } = await sb.storage.from(BUCKET).upload(chemin, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) return { ok: false as const, error: error.message };

  await db.insert(documents).values({
    leadId,
    nom: file.name,
    chemin,
    mime: file.type || null,
    taille: file.size,
    userId: await currentUserId(),
  });
  revalidatePath(`/leads/${leadId}`);
  return { ok: true as const, error: null };
}

// URL signée (10 min) pour consulter / télécharger un document.
export async function getDocumentUrl(id: string) {
  const [d] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1);
  if (!d) return { ok: false as const, error: "Introuvable.", url: null };

  const sb = await createClient();
  const { data, error } = await sb.storage
    .from(BUCKET)
    .createSignedUrl(d.chemin, 60 * 10);
  if (error || !data)
    return { ok: false as const, error: error?.message ?? "Lien indisponible.", url: null };
  return { ok: true as const, error: null, url: data.signedUrl };
}

// Supprime le fichier + sa métadonnée.
export async function deleteDocument(id: string) {
  const [d] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1);
  if (!d) return { ok: false as const, error: "Introuvable." };

  const sb = await createClient();
  await sb.storage.from(BUCKET).remove([d.chemin]);
  await db.delete(documents).where(eq(documents.id, id));
  revalidatePath(`/leads/${d.leadId}`);
  return { ok: true as const, error: null };
}
