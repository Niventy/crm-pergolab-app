import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { like } from "drizzle-orm";
import * as schema from "./schema";
import { surMesureMapping } from "./schema";

// Descriptions pré-stockées par composant du configurateur sur-mesure.
// Les tokens {largeur} {profondeur} {poteaux} … sont remplacés par les valeurs
// du configurateur au moment de générer le devis (voir injecterTokens).
//
// ⚠️ Pennylane n'interprète PAS le Markdown (le gras `**…**` s'afficherait en
// clair sur le PDF). Composition en texte brut : titres en MAJUSCULES, puces
// « • », lignes vides entre les sections. Pas d'astérisques.
const DESCRIPTIONS: Record<string, string> = {
  HORIZON: `PERGOLA BIOCLIMATIQUE ALUMINIUM — GAMME HORIZON
L'excellence au service de votre extérieur

Transformez votre terrasse en un véritable espace de vie haut de gamme, élégant et confortable en toute saison. Design contemporain, technologie innovante et matériaux premium subliment durablement votre extérieur tout en vous offrant une protection optimale face aux variations climatiques.

LES ATOUTS QUI FONT LA DIFFÉRENCE

•  Lames motorisées avec LED intégrées : éclairage d'ambiance tous les 4 lames, contrôlable à distance. Orientez les lames pour gérer lumière, ombre et ventilation en un clic.
•  Drainage invisible et efficace : gouttières et descentes d'eau discrètes pour une évacuation parfaite des eaux de pluie, sans compromis esthétique.
•  Finitions haut de gamme et personnalisables : Gris Anthracite RAL 7016 ou Blanc Pur RAL 9010, thermolaquage AkzoNobel® ultra résistant aux UV, rayures et corrosion.
•  Structure en aluminium extrudé 6063 T5 : solidité maximale, précision dimensionnelle exceptionnelle, longévité garantie 25 ans.
•  Accessoires en inox 304 et laiton H58 : durabilité totale et rendu impeccable.

CARACTÉRISTIQUES TECHNIQUES

•  Poteaux ({poteaux}) : 150 x 150 mm, épaisseur 2,0 mm
•  Lames orientables : 175 x 24 mm, épaisseur 1,6 mm
•  Poutres : 200 x 65 mm, épaisseur 2,0 mm
•  Gouttières intégrées : 115 x 86 mm, épaisseur 1,8 mm
•  Largeur : {largeur} mm
•  Profondeur : {profondeur} mm
•  Hauteur hors tout : 2700 mm

GARANTIE ET QUALITÉ CERTIFIÉE

•  25 ans sur la structure aluminium
•  5 ans sur la motorisation
•  Normes CE strictement respectées
•  Qualité inox et laiton pour une durabilité sans faille

INCLUS DANS VOTRE OFFRE

•  Structure aluminium complète
•  Lames motorisées avec éclairage LED intégré
•  Télécommande et panneau de commande
•  Kit de fixation et notice`,

  ESSENTIA: `PERGOLA BIOCLIMATIQUE ALUMINIUM — GAMME ESSENTIA
Le luxe outdoor à portée de main

Transformez votre terrasse en un espace de vie d'exception, élégant, confortable et résistant toute l'année. Design contemporain, technologie innovante et matériaux premium subliment votre extérieur.

LES ATOUTS QUI FONT LA DIFFÉRENCE

•  Lames motorisées avec LED intégrées : éclairage d'ambiance tous les 4 lames, contrôlable à distance. Orientez les lames pour gérer lumière, ombre et ventilation en un clic.
•  Drainage invisible et efficace : gouttières et descentes d'eau discrètes pour une évacuation parfaite des eaux de pluie, sans compromis esthétique.
•  Finitions haut de gamme et personnalisables : Gris Anthracite RAL 7016 ou Blanc Pur RAL 9010, thermolaquage AkzoNobel® ultra résistant aux UV, rayures et corrosion.
•  Structure en aluminium extrudé 6063 T5 : solidité maximale, précision dimensionnelle exceptionnelle, longévité garantie 15 ans.
•  Accessoires en inox 304 et laiton H58 : durabilité totale et rendu impeccable.

CARACTÉRISTIQUES TECHNIQUES

•  Poteaux ({poteaux}) : 120 x 120 mm, épaisseur 2,0 mm
•  Lames orientables : 143 x 35 mm, épaisseur 1,2 mm
•  Poutres : 170 x 100 mm, épaisseur 2,0 mm
•  Gouttières intégrées
•  Largeur : {largeur} mm
•  Profondeur : {profondeur} mm
•  Hauteur hors tout : 2700 mm

GARANTIE ET QUALITÉ CERTIFIÉE

•  15 ans sur la structure aluminium
•  3 ans sur la motorisation
•  Normes CE strictement respectées
•  Qualité inox et laiton pour une durabilité sans faille

INCLUS DANS VOTRE OFFRE

•  Structure aluminium complète
•  Lames motorisées avec éclairage LED intégré
•  Télécommande et panneau de commande
•  Kit de fixation et notice`,

  SIGNATURE: `PERGOLA BIOCLIMATIQUE ALUMINIUM — GAMME SIGNATURE
Le luxe outdoor à portée de main

Transformez votre terrasse en un espace de vie d'exception, élégant, confortable et résistant toute l'année. Design contemporain, technologie innovante et matériaux premium subliment votre extérieur.

LES ATOUTS QUI FONT LA DIFFÉRENCE

•  Lames motorisées avec LED intégrées : éclairage d'ambiance tous les 4 lames, contrôlable à distance. Orientez les lames pour gérer lumière, ombre et ventilation en un clic.
•  Drainage invisible et efficace : gouttières et descentes d'eau discrètes pour une évacuation parfaite des eaux de pluie, sans compromis esthétique.
•  Finitions haut de gamme et personnalisables : Gris Anthracite RAL 7016 ou Blanc Pur RAL 9010, thermolaquage AkzoNobel® ultra résistant aux UV, rayures et corrosion.
•  Structure en aluminium extrudé 6063 T5 : solidité maximale, précision dimensionnelle exceptionnelle, longévité garantie 15 ans.
•  Accessoires en inox 304 et laiton H58 : durabilité totale et rendu impeccable.

CARACTÉRISTIQUES TECHNIQUES

•  Poteaux ({poteaux}) : 150 x 150 mm, épaisseur 2,0 mm
•  Lames orientables : 220 x 45 mm, épaisseur 1,8 mm
•  Poutres : 250 x 65 mm, épaisseur 2,0 mm
•  Gouttières intégrées : 115 x 65 mm, épaisseur 1,8 mm
•  Largeur des lames : {largeur} mm
•  Profondeur : {profondeur} mm
•  Hauteur hors tout : 2700 mm

GARANTIE ET QUALITÉ CERTIFIÉE

•  15 ans sur la structure aluminium
•  3 ans sur la motorisation
•  Normes CE strictement respectées
•  Qualité inox et laiton pour une durabilité sans faille

INCLUS DANS VOTRE OFFRE

•  Structure aluminium complète
•  Lames motorisées avec éclairage LED intégré
•  Télécommande et panneau de commande
•  Kit de fixation et notice`,

  // Options sans description fournie → placeholder « manquant » (à compléter
  // dans Réglages). Non affiché sur le devis tant que c'est « manquant ».
  sheer: "manquant",
  baie: "manquant",
  volet_fixe: "manquant",
  volet_coul: "manquant",
  volet_pliant: "manquant",
  mur_fixe: "manquant",
  lames_motor: "manquant",
  chauffage: "manquant",
  ventilo: "manquant",
  ventilo_led: "manquant",
  capteur: "manquant",
  coffre: "manquant",

  zip: `STORE ZIP MOTORISÉ POUR PERGOLA
Confort, design et technologie pour votre espace extérieur

Alliez confort, design et technologie grâce à notre store zip spécialement conçu pour pergolas. Facile à manipuler grâce à sa motorisation A-OK compatible 110V ou 220V, il se commande simplement à distance via une télécommande, pour un usage pratique au quotidien.

Sa toile technique, composée de 30% polyester et 70% PVC, vous protège efficacement du vent et de la pluie tout en laissant passer la lumière naturelle avec une transparence maîtrisée de 5%. La fermeture éclair des deux côtés assure une installation impeccable et une meilleure résistance face aux intempéries.

CARACTÉRISTIQUES PRINCIPALES

•  Motorisation : A-OK AC110V ou 220V, télécommande incluse
•  Fermeture : éclair (zip) des deux côtés
•  Protection : résistant au vent et à l'eau
•  Toile : 30% polyester et 70% PVC, transparence de 5%`,
};

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL n'est pas défini. Renseignez .env.local.");
  }

  const client = postgres(connectionString, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });

  console.log("Seed des descriptions sur-mesure…");
  for (const [composant, description] of Object.entries(DESCRIPTIONS)) {
    await db
      .insert(surMesureMapping)
      .values({ composant, description })
      .onConflictDoUpdate({
        target: surMesureMapping.composant,
        set: { description },
      });
    console.log(`  ✓ ${composant} (${description.length} caractères)`);
  }

  // Nettoyage des anciennes clés séparées (le kit remplace toit_/poteau_).
  const del = await db
    .delete(surMesureMapping)
    .where(like(surMesureMapping.composant, "toit\\_%"));
  const del2 = await db
    .delete(surMesureMapping)
    .where(like(surMesureMapping.composant, "poteau\\_%"));
  console.log(
    `  ⌫ anciennes clés supprimées (toit_/poteau_) : ${
      (del.count ?? 0) + (del2.count ?? 0)
    }`,
  );

  await client.end();
  console.log("Terminé.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
