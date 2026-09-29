"use server";

import { asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { echanges, leads, poseurs } from "@/db/schema";
import { currentUserId } from "@/lib/current-user";

export type PoseurDTO = {
  id: string;
  nom: string;
  telephone: string | null;
  actif: boolean;
};

// Liste des poseurs (actifs par défaut ; `tousLesEtats` = retirés inclus, pour
// l'écran Réglages et pour afficher le poseur d'un ancien chantier).
export async function getPoseurs(tousLesEtats = false): Promise<PoseurDTO[]> {
  const rows = await db.select().from(poseurs).orderBy(asc(poseurs.nom));
  return rows
    .filter((r) => tousLesEtats || r.actif)
    .map((r) => ({ id: r.id, nom: r.nom, telephone: r.telephone, actif: r.actif }));
}

function revaliderChantiers(leadId?: string) {
  if (leadId) revalidatePath(`/leads/${leadId}`);
  revalidatePath("/clients", "layout");
  revalidatePath("/emploi-du-temps");
}

// Affecte (ou retire, `null`) le poseur d'une fiche — à un clic, journalisé.
export async function setPoseurLead(leadId: string, poseurId: string | null) {
  const userId = await currentUserId();
  const [current] = await db
    .select({ poseurId: leads.poseurId })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
  if (!current) return { ok: false as const, error: "Fiche introuvable." };
  if ((current.poseurId ?? null) === poseurId) return { ok: true as const, error: null };

  let nom: string | null = null;
  if (poseurId) {
    const [p] = await db.select().from(poseurs).where(eq(poseurs.id, poseurId)).limit(1);
    if (!p) return { ok: false as const, error: "Poseur introuvable." };
    nom = p.nom;
  }

  await db
    .update(leads)
    .set({ poseurId, updatedAt: new Date(), updatedBy: userId })
    .where(eq(leads.id, leadId));
  await db.insert(echanges).values({
    leadId,
    userId,
    type: "modification",
    contenu: nom ? `Poseur : ${nom}` : "Poseur retiré",
  });
  revaliderChantiers(leadId);
  return { ok: true as const, error: null };
}

const memeNom = (nom: string) => sql`lower(${poseurs.nom}) = ${nom.toLowerCase()}`;

// Ajoute un poseur à la liste. `leadId` fourni → il est affecté dans la foulée
// (« Nouveau poseur… » depuis la fiche). Un nom déjà présent est réutilisé
// (et réactivé s'il avait été retiré) plutôt que dupliqué.
export async function creerPoseur(data: {
  nom: string;
  telephone?: string | null;
  leadId?: string;
}) {
  const nom = data.nom?.trim().replace(/\s+/g, " ");
  if (!nom) return { ok: false as const, error: "Le nom du poseur est obligatoire." };

  const [existant] = await db.select().from(poseurs).where(memeNom(nom)).limit(1);
  let id = existant?.id;
  if (existant) {
    if (!existant.actif) await db.update(poseurs).set({ actif: true }).where(eq(poseurs.id, existant.id));
  } else {
    const [row] = await db
      .insert(poseurs)
      .values({ nom, telephone: data.telephone?.trim() || null })
      .returning({ id: poseurs.id });
    id = row.id;
  }

  if (data.leadId && id) {
    const r = await setPoseurLead(data.leadId, id);
    if (!r.ok) return r;
  }
  revalidatePath("/reglages/poseurs");
  revaliderChantiers(data.leadId);
  return { ok: true as const, error: null, id };
}

// Renomme / complète un poseur (le nom change sur toutes ses fiches).
export async function updatePoseur(id: string, data: { nom: string; telephone?: string | null }) {
  const nom = data.nom?.trim().replace(/\s+/g, " ");
  if (!nom) return { ok: false as const, error: "Le nom du poseur est obligatoire." };
  const [doublon] = await db.select({ id: poseurs.id }).from(poseurs).where(memeNom(nom)).limit(1);
  if (doublon && doublon.id !== id)
    return { ok: false as const, error: `« ${nom} » existe déjà dans la liste.` };

  await db
    .update(poseurs)
    .set({ nom, telephone: data.telephone?.trim() || null })
    .where(eq(poseurs.id, id));
  revalidatePath("/reglages/poseurs");
  revaliderChantiers();
  return { ok: true as const, error: null };
}

// Retire (actif = false) ou réactive un poseur. On ne supprime pas la ligne :
// ses chantiers passés gardent son nom.
export async function setPoseurActif(id: string, actif: boolean) {
  await db.update(poseurs).set({ actif }).where(eq(poseurs.id, id));
  revalidatePath("/reglages/poseurs");
  revaliderChantiers();
  return { ok: true as const, error: null };
}

// Nombre de chantiers (fiches non supprimées) par poseur — écran Réglages.
export async function getChantiersParPoseur(): Promise<Record<string, number>> {
  const rows = await db
    .select({ id: leads.poseurId, n: sql<number>`count(*)::int` })
    .from(leads)
    .where(sql`${leads.poseurId} is not null and ${leads.deletedAt} is null`)
    .groupBy(leads.poseurId);
  const map: Record<string, number> = {};
  for (const r of rows) if (r.id) map[r.id] = Number(r.n);
  return map;
}
