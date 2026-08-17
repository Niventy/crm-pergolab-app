import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { surMesureMapping } from "./schema";

// Descriptions pré-stockées par composant du configurateur sur-mesure.
// Les tokens {largeur} {profondeur} {poteaux} … sont remplacés par les valeurs
// du configurateur au moment de générer le devis (voir injecterTokens).
const DESCRIPTIONS: Record<string, string> = {
  toit_HORIZON: `Pergola bioclimatique en aluminium – L'excellence au service de votre extérieur

Transformez votre terrasse en un véritable espace de vie haut de gamme, élégant et confortable en toute saison. Grâce à son design contemporain, sa technologie innovante et ses matériaux premium, notre pergola bioclimatique sublime durablement votre extérieur tout en vous offrant une protection optimale face aux variations climatiques.

Les Atouts Qui Font Toute la Différence

* Lames motorisées avec LED intégrées
* Un éclairage d'ambiance LED intégré tous les 4 lames pour des soirées magiques sous votre pergola, contrôlable à distance. Modifiez l'orientation des lames pour gérer lumière, ombre et ventilation en un clic.
* Système de drainage invisible et efficace
* Gouttières et descentes d'eau discrètes assurent une évacuation parfaite des eaux de pluie, protégeant votre terrasse sans compromis esthétique.
* Finitions haut de gamme & Personnalisables
* Choisissez votre couleur : Gris Anthracite RAL 7016 ou Blanc Pur RAL 9010, grâce au thermolaquage AkzoNobel® ultra résistant aux UV, rayures et corrosion.
* Structure robuste en aluminium extrudé 6063 T5
* Profitez d'une solidité maximale, d'une précision dimensionnelle exceptionnelle, et d'une longévité garantie 25 ans.
* Accessoires en inox 304 & laiton H58
* Pour une durabilité totale et un rendu impeccable.


Caractéristiques Techniques – Pergola Bioclimatique Aluminium

* {poteaux} Poteaux : dimensions 150 mm x 150 mm, épaisseur 2,0 mm
* Lames orientables : dimensions 175 mm x 24 mm, épaisseur 1,6 mm
* Poutres : dimensions 200 mm x 65 mm, épaisseur 2,0 mm
* Gouttières intégrées : dimensions 115 mm x 86 mm, épaisseur 1,8 mm
* Largeur {largeur} mm
* Profondeur {profondeur} mm
* Hauteur hors tout 2700 mm


Points forts techniques :

* Structure en aluminium extrudé 6063 T5 pour une solidité et une longévité exceptionnelles
* Finition thermolaquée AkzoNobel®, garantissant une haute résistance aux UV, rayures et intempéries
* Design moderne et épuré, pensé pour valoriser tous types d'extérieurs

Garantie & Qualité Certifiée

* 25 ans sur la structure aluminium
* 5 ans sur la motorisation
* Normes CE strictement respectées
* Qualité inox et laiton pour une durabilité sans faille


Pourquoi Choisir Notre Pergola ?

* Fabrication haut de gamme par extrusion aluminium = profilés ultra résistants et parfaitement ajustés
* Laquage AkzoNobel® = couleur stable, durable, anti-corrosion et anti-UV
* LED intégrées tous les 4 lames = ambiance lumineuse unique et personnalisable


Inclus dans Votre Offre

* Structure aluminium complète
* Lames motorisées avec éclairage LED intégré
* Télécommande + panneau de commande
* Kit de fixation, notice


Applications Idéales

* Terrasses privées
* Jardins & espaces piscine
* Cafés, hôtels & restaurants
* Espaces professionnels et rooftops`,

  toit_ESSENTIA: `Pergola Bioclimatique Aluminium – Le Luxe Outdoor à Portée de Main

Transformez votre terrasse en un espace de vie d'exception, élégant, confortable et résistant toute l'année. Notre pergola bioclimatique allie design contemporain, technologie innovante et matériaux premium pour sublimer votre extérieur.

Les Atouts Qui Font Toute la Différence

* Lames motorisées avec LED intégrées
* Un éclairage d'ambiance LED intégré tous les 4 lames pour des soirées magiques sous votre pergola, contrôlable à distance. Modifiez l'orientation des lames pour gérer lumière, ombre et ventilation en un clic.
* Système de drainage invisible et efficace
* Gouttières et descentes d'eau discrètes assurent une évacuation parfaite des eaux de pluie, protégeant votre terrasse sans compromis esthétique.
* Finitions haut de gamme & Personnalisables
* Choisissez votre couleur : Gris Anthracite RAL 7016 ou Blanc Pur RAL 9010, grâce au thermolaquage AkzoNobel® ultra résistant aux UV, rayures et corrosion.
* Structure robuste en aluminium extrudé 6063 T5
* Profitez d'une solidité maximale, d'une précision dimensionnelle exceptionnelle, et d'une longévité garantie 15 ans.
* Accessoires en inox 304 & laiton H58
* Pour une durabilité totale et un rendu impeccable.


Caractéristiques Techniques – Pergola Bioclimatique Aluminium

* {poteaux} Poteaux : dimensions 120 mm x 120 mm, épaisseur 2,0 mm
* Lames orientables : dimensions 143 mm x 35 mm, épaisseur 1,2 mm
* Poutres : dimensions 170 mm x 100 mm, épaisseur 2,0 mm
* Gouttières intégrées
* Largeur {largeur} mm
* Profondeur {profondeur} mm
* Hauteur hors tout 2700 mm


Points forts techniques :

* Structure en aluminium extrudé 6063 T5 pour une solidité et une longévité exceptionnelles
* Finition thermolaquée AkzoNobel®, garantissant une haute résistance aux UV, rayures et intempéries
* Design moderne et épuré, pensé pour valoriser tous types d'extérieurs

Garantie & Qualité Certifiée

* 15 ans sur la structure aluminium
* 3 ans sur la motorisation
* Normes CE strictement respectées
* Qualité inox et laiton pour une durabilité sans faille


Pourquoi Choisir Notre Pergola ?

* Fabrication haut de gamme par extrusion aluminium = profilés ultra résistants et parfaitement ajustés
* Laquage AkzoNobel® = couleur stable, durable, anti-corrosion et anti-UV
* LED intégrées tous les 4 lames = ambiance lumineuse unique et personnalisable


Inclus dans Votre Offre

* Structure aluminium complète
* Lames motorisées avec éclairage LED intégré
* Télécommande + panneau de commande
* Kit de fixation, notice


Applications Idéales

* Terrasses privées
* Jardins & espaces piscine
* Cafés, hôtels & restaurants
* Espaces professionnels et rooftops`,

  toit_SIGNATURE: `Pergola Bioclimatique Aluminium – Le Luxe Outdoor à Portée de Main

Transformez votre terrasse en un espace de vie d'exception, élégant, confortable et résistant toute l'année. Notre pergola bioclimatique allie design contemporain, technologie innovante et matériaux premium pour sublimer votre extérieur.

Les Atouts Qui Font Toute la Différence

* Lames motorisées avec LED intégrées
* Un éclairage d'ambiance LED intégré tous les 4 lames pour des soirées magiques sous votre pergola, contrôlable à distance. Modifiez l'orientation des lames pour gérer lumière, ombre et ventilation en un clic.
* Système de drainage invisible et efficace
* Gouttières et descentes d'eau discrètes assurent une évacuation parfaite des eaux de pluie, protégeant votre terrasse sans compromis esthétique.
* Finitions haut de gamme & Personnalisables
* Choisissez votre couleur : Gris Anthracite RAL 7016 ou Blanc Pur RAL 9010, grâce au thermolaquage AkzoNobel® ultra résistant aux UV, rayures et corrosion.
* Structure robuste en aluminium extrudé 6063 T5
* Profitez d'une solidité maximale, d'une précision dimensionnelle exceptionnelle, et d'une longévité garantie 15 ans.
* Accessoires en inox 304 & laiton H58
* Pour une durabilité totale et un rendu impeccable.


Caractéristiques Techniques – Pergola Bioclimatique Aluminium

* {poteaux} Poteaux : dimensions 150 mm x 150 mm, épaisseur 2,0 mm
* Lames orientables : dimensions 220 mm x 45 mm, épaisseur 1,8 mm
* Poutres : dimensions 250 mm x 65 mm, épaisseur 2,0 mm
* Gouttières intégrées : dimensions 115 mm x 65 mm, épaisseur 1,8 mm
* Largeur lames {largeur} mm
* Profondeur {profondeur} mm
* Hauteur hors tout 2700 mm


Points forts techniques :

* Structure en aluminium extrudé 6063 T5 pour une solidité et une longévité exceptionnelles
* Finition thermolaquée AkzoNobel®, garantissant une haute résistance aux UV, rayures et intempéries
* Design moderne et épuré, pensé pour valoriser tous types d'extérieurs

Garantie & Qualité Certifiée

* 15 ans sur la structure aluminium
* 3 ans sur la motorisation
* Normes CE strictement respectées
* Qualité inox et laiton pour une durabilité sans faille


Pourquoi Choisir Notre Pergola ?

* Fabrication haut de gamme par extrusion aluminium = profilés ultra résistants et parfaitement ajustés
* Laquage AkzoNobel® = couleur stable, durable, anti-corrosion et anti-UV
* LED intégrées tous les 4 lames = ambiance lumineuse unique et personnalisable


Inclus dans Votre Offre

* Structure aluminium complète
* Lames motorisées avec éclairage LED intégré
* Télécommande + panneau de commande
* Kit de fixation, notice


Applications Idéales

* Terrasses privées
* Jardins & espaces piscine
* Cafés, hôtels & restaurants
* Espaces professionnels et rooftops`,

  zip: `Optimisez votre espace extérieur avec notre store zip motorisé pour pergola !

Alliez confort, design et technologie grâce à notre store zip spécialement conçu pour pergolas. Facile à manipuler grâce à sa motorisation A-OK compatible 110V ou 220V, il se commande simplement à distance via une télécommande, pour un usage pratique au quotidien.

Sa toile technique, composée de 30% polyester et 70% PVC, vous protège efficacement du vent et de la pluie tout en laissant passer la lumière naturelle avec une transparence maîtrisée de 5%. La fermeture éclair des deux côtés assure une installation impeccable et une meilleure résistance face aux intempéries.

Caractéristiques principales :
* Motorisation : A-OK AC110V ou 220V, télécommande incluse
* Fermeture : Fermeture éclair (zip) des deux côtés
* Protection : Résistant au vent et à l'eau
* Toile : Composée de 30% polyester et 70% PVC, offrant une transparence de 5%`,
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

  await client.end();
  console.log("Terminé.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
