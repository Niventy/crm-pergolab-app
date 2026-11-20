import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "./schema";
import { stages } from "./schema";
import { STAGE_CODE_PAR_NOM } from "../lib/pipeline";

// Étapes par défaut du pipeline. Couleurs = pastilles discrètes.
// cycle : 1 = prospection, 2 = devis & closing (bascule à « Devis envoyé »).
const DEFAULT_STAGES = [
  // Cycle 1 — prospection.
  { nom: "À traiter", position: 1, couleur: "#3b82f6", cycle: 1, isGagnee: false, isPerdue: false },
  { nom: "Pas de réponse", position: 2, couleur: "#94a3b8", cycle: 1, isGagnee: false, isPerdue: false },
  { nom: "Rappeler", position: 3, couleur: "#f59e0b", cycle: 1, isGagnee: false, isPerdue: false },
  { nom: "RDV Téléphonique", position: 4, couleur: "#7c3aed", cycle: 1, isGagnee: false, isPerdue: false },
  { nom: "Devis à envoyer", position: 5, couleur: "#06b6d4", cycle: 1, isGagnee: false, isPerdue: false },
  { nom: "Projet à venir", position: 6, couleur: "#84cc16", cycle: 1, isGagnee: false, isPerdue: false },
  { nom: "Hors Zone KO", position: 7, couleur: "#b91c1c", cycle: 1, isGagnee: false, isPerdue: true },
  { nom: "Non qualifié KO", position: 8, couleur: "#9f1239", cycle: 1, isGagnee: false, isPerdue: true },
  // Cycle 2 — devis & closing.
  { nom: "Rendez-vous", position: 9, couleur: "#8b5cf6", cycle: 2, isGagnee: false, isPerdue: false },
  { nom: "Devis envoyé", position: 10, couleur: "#0ea5e9", cycle: 2, isGagnee: false, isPerdue: false },
  { nom: "Signée", position: 11, couleur: "#22c55e", cycle: 2, isGagnee: true, isPerdue: false },
  { nom: "KO", position: 12, couleur: "#ef4444", cycle: 2, isGagnee: false, isPerdue: true },
  // Cycle 3 — pose & technique (après signature). Le statut « gagnée » reste.
  { nom: "À métrer", position: 13, couleur: "#a855f7", cycle: 3, isGagnee: false, isPerdue: false },
  { nom: "Métré réalisé", position: 14, couleur: "#8b5cf6", cycle: 3, isGagnee: false, isPerdue: false },
  { nom: "Commande fournisseur", position: 15, couleur: "#6366f1", cycle: 3, isGagnee: false, isPerdue: false },
  { nom: "En livraison", position: 16, couleur: "#0ea5e9", cycle: 3, isGagnee: false, isPerdue: false },
  { nom: "Pose planifiée", position: 17, couleur: "#14b8a6", cycle: 3, isGagnee: false, isPerdue: false },
  { nom: "Posée", position: 18, couleur: "#22c55e", cycle: 3, isGagnee: false, isPerdue: false },
  { nom: "SAV", position: 19, couleur: "#f59e0b", cycle: 3, isGagnee: false, isPerdue: false },
  // Commande annulée après signature (rétractation, refus de financement…) :
  // la fiche repasse « perdue » et sort du CA, sans revenir en prospection.
  { nom: "Annulée", position: 20, couleur: "#dc2626", cycle: 3, isGagnee: false, isPerdue: true },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL n'est pas défini. Renseignez .env.local.");
  }

  const client = postgres(connectionString, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });

  console.log("Seed des étapes par défaut…");

  for (const stage of DEFAULT_STAGES) {
    const existing = await db
      .select()
      .from(stages)
      .where(eq(stages.nom, stage.nom));

    const code = STAGE_CODE_PAR_NOM[stage.nom] ?? null;
    if (existing.length > 0) {
      // Backfill du cycle + de la clé stable sur une étape déjà présente.
      await db
        .update(stages)
        .set({ cycle: stage.cycle, code })
        .where(eq(stages.nom, stage.nom));
      console.log(`  • « ${stage.nom} » existe déjà — cycle ${stage.cycle}, code ${code} mis à jour.`);
      continue;
    }

    await db.insert(stages).values({ ...stage, code });
    console.log(`  ✓ « ${stage.nom} » créée (cycle ${stage.cycle}).`);
  }

  console.log("Seed terminé.");
  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Erreur lors du seed :", err);
  process.exit(1);
});
