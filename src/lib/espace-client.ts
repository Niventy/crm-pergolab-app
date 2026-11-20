import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { accesClient, leads } from "@/db/schema";

// Espace client : lien magique `/espace/<jeton>`. Le jeton (32 octets aléatoires,
// base64url = 43 caractères) EST l'accès — pas de compte, pas de mot de passe.
// Durée de validité par défaut : 18 mois (couvre chantier + SAV de la 1ʳᵉ année).
export const DUREE_LIEN_JOURS = 548;

const FORMAT_JETON = /^[A-Za-z0-9_-]{43}$/;

export function nouveauJeton(): string {
  return randomBytes(32).toString("base64url");
}

// Lien actif (non révoqué, non expiré) d'une fiche, ou null.
export async function lienActif(leadId: string) {
  const [row] = await db
    .select()
    .from(accesClient)
    .where(
      and(
        eq(accesClient.leadId, leadId),
        isNull(accesClient.revokedAt),
        or(isNull(accesClient.expiresAt), gt(accesClient.expiresAt, new Date())),
      ),
    )
    .orderBy(sql`${accesClient.createdAt} desc`)
    .limit(1);
  return row ?? null;
}

// Résout un jeton → id de la fiche, ou null (inconnu, révoqué, expiré, fiche à
// la corbeille). Toute page / route de l'espace client passe par ici.
// `compterVisite` : met à jour « dernière visite » (pages seulement, pas les PDF).
export async function resoudreJeton(
  jeton: string,
  { compterVisite = false } = {},
): Promise<string | null> {
  if (!FORMAT_JETON.test(jeton)) return null;
  const [row] = await db
    .select({ id: accesClient.id, leadId: accesClient.leadId })
    .from(accesClient)
    .innerJoin(leads, eq(leads.id, accesClient.leadId))
    .where(
      and(
        eq(accesClient.jeton, jeton),
        isNull(accesClient.revokedAt),
        or(isNull(accesClient.expiresAt), gt(accesClient.expiresAt, new Date())),
        isNull(leads.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return null;
  if (compterVisite) {
    await db
      .update(accesClient)
      .set({ derniereVisite: new Date(), nbVisites: sql`${accesClient.nbVisites} + 1` })
      .where(eq(accesClient.id, row.id));
  }
  return row.leadId;
}

// Devis montré au client : le devis signé et ceux réellement ENVOYÉS (jamais un
// brouillon ni une variante « Non retenu »), avec un PDF Pennylane.
export function devisVisibleClient(d: {
  externalId: string | null;
  accepteAt: Date | null;
  statut: string | null;
}): boolean {
  return !!d.externalId && (!!d.accepteAt || d.statut === "Envoyé" || d.statut === "Signé");
}

// Facture montrée au client : validée dans Pennylane (statut finalized, upcoming,
// paid…), jamais un brouillon ni une facture disparue de Pennylane.
export function factureVisibleClient(f: { externalId: string | null; statut: string | null }): boolean {
  return !!f.externalId && !!f.statut && f.statut !== "draft" && f.statut !== "supprimee";
}
