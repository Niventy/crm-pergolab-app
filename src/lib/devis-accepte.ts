// Devis ACCEPTÉ (signé) d'un lead : un seul par lead. C'est lui qui fixe le
// montant du lead (pipeline / CA) et la base de la facturation — pas « le
// dernier devis touché », qui pouvait être une variante non retenue.
import { and, eq, isNotNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { devis, leads } from "@/db/schema";

export async function accepterDevis(leadId: string, devisId: string) {
  const d = await db.query.devis.findFirst({
    where: and(eq(devis.id, devisId), eq(devis.leadId, leadId)),
  });
  if (!d) return { ok: false as const, error: "Devis introuvable." };

  // Les autres devis du lead perdent leur acceptation (variantes non retenues).
  await db
    .update(devis)
    .set({ accepteAt: null, statut: "Non retenu" })
    .where(
      and(eq(devis.leadId, leadId), ne(devis.id, devisId), isNotNull(devis.accepteAt)),
    );
  await db
    .update(devis)
    .set({ accepteAt: new Date(), statut: "Accepté" })
    .where(eq(devis.id, devisId));

  // Le lead prend les montants du devis signé.
  await db
    .update(leads)
    .set({
      montant: d.montant,
      montantTtc: d.montantTtc,
      pennylaneQuoteId: d.externalId ?? undefined,
    })
    .where(eq(leads.id, leadId));

  return { ok: true as const, error: null };
}

// À la signature : si le lead n'a qu'UN devis et aucun accepté, on l'accepte
// automatiquement (cas courant). Plusieurs devis → l'ADV choisit sur la fiche.
export async function autoAccepterDevisSiUnique(leadId: string) {
  const rows = await db
    .select({ id: devis.id, accepteAt: devis.accepteAt })
    .from(devis)
    .where(eq(devis.leadId, leadId));
  if (rows.some((r) => r.accepteAt)) return;
  if (rows.length === 1) await accepterDevis(leadId, rows[0].id);
}
