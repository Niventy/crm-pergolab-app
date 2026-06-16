import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "./schema";
import { stages } from "./schema";

// Étapes par défaut du pipeline. Couleurs = pastilles discrètes.
// cycle : 1 = prospection, 2 = devis & closing (bascule à « Devis envoyé »).
const DEFAULT_STAGES = [
  { nom: "À traiter", position: 1, couleur: "#3b82f6", cycle: 1, isGagnee: false, isPerdue: false },
  { nom: "Pas de réponse", position: 2, couleur: "#94a3b8", cycle: 1, isGagnee: false, isPerdue: false },
  { nom: "Rappeler", position: 3, couleur: "#f59e0b", cycle: 1, isGagnee: false, isPerdue: false },
  { nom: "Rendez-vous", position: 4, couleur: "#8b5cf6", cycle: 2, isGagnee: false, isPerdue: false },
  { nom: "Devis à envoyer", position: 5, couleur: "#06b6d4", cycle: 1, isGagnee: false, isPerdue: false },
  { nom: "Devis envoyé", position: 6, couleur: "#0ea5e9", cycle: 2, isGagnee: false, isPerdue: false },
  { nom: "Signée", position: 7, couleur: "#22c55e", cycle: 2, isGagnee: true, isPerdue: false },
  { nom: "KO", position: 8, couleur: "#ef4444", cycle: 2, isGagnee: false, isPerdue: true },
  // Cycle 3 — pose & technique (après signature). Le statut « gagnée » reste.
  { nom: "À métrer", position: 9, couleur: "#a855f7", cycle: 3, isGagnee: false, isPerdue: false },
  { nom: "Métré réalisé", position: 10, couleur: "#8b5cf6", cycle: 3, isGagnee: false, isPerdue: false },
  { nom: "Commande fournisseur", position: 11, couleur: "#6366f1", cycle: 3, isGagnee: false, isPerdue: false },
  { nom: "En livraison", position: 12, couleur: "#0ea5e9", cycle: 3, isGagnee: false, isPerdue: false },
  { nom: "Pose planifiée", position: 13, couleur: "#14b8a6", cycle: 3, isGagnee: false, isPerdue: false },
  { nom: "Posée", position: 14, couleur: "#22c55e", cycle: 3, isGagnee: false, isPerdue: false },
  { nom: "SAV", position: 15, couleur: "#f59e0b", cycle: 3, isGagnee: false, isPerdue: false },
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

    if (existing.length > 0) {
      // Backfill du cycle sur une étape déjà présente.
      await db
        .update(stages)
        .set({ cycle: stage.cycle })
        .where(eq(stages.nom, stage.nom));
      console.log(`  • « ${stage.nom} » existe déjà — cycle ${stage.cycle} mis à jour.`);
      continue;
    }

    await db.insert(stages).values(stage);
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
