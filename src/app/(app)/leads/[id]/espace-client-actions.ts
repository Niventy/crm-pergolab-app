"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/db";
import { accesClient, echanges, leads } from "@/db/schema";
import { currentProfile, currentUserId } from "@/lib/current-user";
import { envoyerLienAcces } from "@/lib/espace-client-email";
import { DUREE_LIEN_JOURS, lienActif, nouveauJeton } from "@/lib/espace-client";

export type AccesClientDTO = {
  jeton: string;
  createdAt: string;
  expiresAt: string | null;
  derniereVisite: string | null;
  nbVisites: number;
};

function dto(row: typeof accesClient.$inferSelect): AccesClientDTO {
  return {
    jeton: row.jeton,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    derniereVisite: row.derniereVisite?.toISOString() ?? null,
    nbVisites: row.nbVisites,
  };
}

// Lien actif de la fiche (affiché dans le bloc « Espace client »).
export async function getAccesClient(leadId: string): Promise<AccesClientDTO | null> {
  if (!(await currentUserId())) return null;
  const row = await lienActif(leadId);
  return row ? dto(row) : null;
}

// Crée le lien de l'espace client. Un lien déjà actif est RÉVOQUÉ (un seul lien
// valable par fiche : « Nouveau lien » sert aussi à couper un lien transmis par erreur).
export async function creerLienEspaceClient(leadId: string) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "Non connecté." };
  const [lead] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.id, leadId), isNull(leads.deletedAt)))
    .limit(1);
  if (!lead) return { ok: false as const, error: "Fiche introuvable." };

  const maintenant = new Date();
  const remplace = await db
    .update(accesClient)
    .set({ revokedAt: maintenant })
    .where(and(eq(accesClient.leadId, leadId), isNull(accesClient.revokedAt)))
    .returning({ id: accesClient.id });

  const [row] = await db
    .insert(accesClient)
    .values({
      leadId,
      jeton: nouveauJeton(),
      createdBy: userId,
      expiresAt: new Date(maintenant.getTime() + DUREE_LIEN_JOURS * 86_400_000),
    })
    .returning();

  await db.insert(echanges).values({
    leadId,
    userId,
    type: "espace_client",
    contenu: remplace.length
      ? "Espace client : nouveau lien (l'ancien ne fonctionne plus)"
      : "Espace client : lien créé",
  });
  revalidatePath(`/leads/${leadId}`);
  return { ok: true as const, error: null, acces: dto(row) };
}

// Coupe l'accès : le lien ne fonctionne plus (l'historique est conservé).
export async function revoquerLienEspaceClient(leadId: string) {
  const userId = await currentUserId();
  if (!userId) return { ok: false as const, error: "Non connecté." };
  const revoques = await db
    .update(accesClient)
    .set({ revokedAt: new Date() })
    .where(and(eq(accesClient.leadId, leadId), isNull(accesClient.revokedAt)))
    .returning({ id: accesClient.id });
  if (revoques.length) {
    await db.insert(echanges).values({
      leadId,
      userId,
      type: "espace_client",
      contenu: "Espace client : accès coupé",
    });
  }
  revalidatePath(`/leads/${leadId}`);
  return { ok: true as const, error: null };
}

// Envoie au client l'email « Accéder à mon projet » depuis la boîte de l'ADV
// connecté (Reply-To = l'ADV). Crée le lien d'accès s'il n'existe pas.
export async function envoyerAccesParEmail(leadId: string) {
  const moi = await currentProfile();
  if (!moi) return { ok: false as const, error: "Non connecté." };
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return { ok: false as const, error: "Adresse du CRM inconnue." };
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const r = await envoyerLienAcces({
    leadId,
    origin: `${proto}://${host}`,
    depuisFiche: { userId: moi.id, userEmail: moi.email },
  });
  if (!r.ok) return { ok: false as const, error: r.error };
  revalidatePath(`/leads/${leadId}`);
  return { ok: true as const, error: null };
}
