// Règles du pipeline côté serveur (accès DB).
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { devis, echanges, leads, stages, type Stage } from "@/db/schema";
import { CYCLE_CHANTIER, STAGE, type StageCode } from "@/lib/pipeline";
import { ymdParis } from "@/lib/format";

// Étape par CLÉ stable (jamais par nom : le nom est modifiable par l'équipe).
export async function stageParCode(code: StageCode): Promise<Stage | null> {
  const [s] = await db.select().from(stages).where(eq(stages.code, code)).limit(1);
  return s ?? null;
}

// Étape d'entrée d'un nouveau lead : « À traiter », sinon 1ʳᵉ du cycle 1.
export async function stageEntree(): Promise<Stage | null> {
  const parCode = await stageParCode(STAGE.A_TRAITER);
  if (parCode) return parCode;
  const [s] = await db
    .select()
    .from(stages)
    .where(eq(stages.cycle, 1))
    .orderBy(asc(stages.position))
    .limit(1);
  return s ?? null;
}

// « Signée » est une étape de PASSAGE : la fiche devient un client et démarre
// aussitôt le chantier sur la 1ʳᵉ étape du cycle 3 (« À métrer »). Avant, elle
// restait sur « Signée » (cycle 2) : rail client vide, pilules du mauvais cycle,
// « — hors chantier — » dans le tableau, jusqu'à une action manuelle.
export async function etapeEffective(stage: Stage): Promise<Stage> {
  if (!stage.isGagnee) return stage;
  const [premiere] = await db
    .select()
    .from(stages)
    .where(and(eq(stages.cycle, CYCLE_CHANTIER), eq(stages.isPerdue, false)))
    .orderBy(asc(stages.position))
    .limit(1);
  return premiere ?? stage;
}

// Libellé du déplacement pour le journal d'activité.
export function libelleDeplacement(demandee: Stage, effective: Stage): string {
  return demandee.id === effective.id
    ? `Déplacé en « ${demandee.nom} »`
    : `Signé (« ${demandee.nom} ») → chantier démarré en « ${effective.nom} »`;
}

// Un devis a RÉELLEMENT été envoyé au client (Gmail ou Pennylane) : la fiche
// avance en « Devis envoyé » (jamais en arrière), une relance est programmée à
// +3 j et l'activité est journalisée. Avant, c'était la simple CRÉATION du
// brouillon qui déclenchait tout ça.
export async function marquerDevisEnvoye(opts: {
  leadId: string;
  userId: string | null;
  numero: string | null;
  via: string; // « par email à x@y » / « via Pennylane »
  quoteId?: string | null; // id Pennylane → statut du devis « Envoyé »
}) {
  const { leadId, userId, numero, via, quoteId } = opts;

  // Le devis lui-même passe « Envoyé » (sauf s'il est déjà accepté).
  if (quoteId) {
    await db
      .update(devis)
      .set({ statut: "Envoyé" })
      .where(
        and(eq(devis.externalId, quoteId), eq(devis.leadId, leadId), isNull(devis.accepteAt)),
      );
  }
  const [lead] = await db
    .select({ stageId: leads.stageId, statut: leads.statut })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
  const cible = await stageParCode(STAGE.DEVIS_ENVOYE);
  const [actuelle] = lead?.stageId
    ? await db.select().from(stages).where(eq(stages.id, lead.stageId)).limit(1)
    : [undefined];

  const avance =
    !!cible &&
    lead?.statut === "en_cours" &&
    (!actuelle || cible.position > actuelle.position);

  const rappel = ymdParis(new Date(Date.now() + 3 * 86400000));

  await db
    .update(leads)
    .set({
      ...(avance && cible ? { stageId: cible.id } : {}),
      nextRelanceDate: rappel,
      updatedAt: new Date(),
      updatedBy: userId,
    })
    .where(eq(leads.id, leadId));

  await db.insert(echanges).values({
    leadId,
    userId,
    type: "devis_envoye",
    contenu: `Devis ${numero ?? ""} envoyé ${via} — relance prévue le ${rappel
      .split("-")
      .reverse()
      .join("/")}`.replace(/\s+/g, " "),
  });
}
