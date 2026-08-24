import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "./schema";
import { produitsCatalogue } from "./schema";

// Produits autonomes du catalogue (ajoutables directement en ligne de devis).
// Les prix sont laissés à 0 quand ils ne sont pas connus — à compléter dans
// Réglages > Produits & options.
type Seed = {
  nom: string;
  categorie: string;
  position: number;
  description: string;
};

// NB : « Store Zip motorisé » est géré par le CONFIGURATEUR (option « Store
// Motorisé », dimensionnée) et « Clause suspensive » est ajoutée automatiquement
// à 0 € sur chaque devis → tous deux retirés de ce catalogue (plus de doublon).
const PRODUITS: Seed[] = [
  {
    nom: "VR Rénobloc® ADP 55",
    categorie: "Menuiserie",
    position: 20,
    description: `VOLET ROULANT RÉNOBLOC® ADP 55

Coffre pan coupé ou 1/4 de rond.

•  Tablier ajouré (sauf en tirage direct et en alu filé)
•  Lame finale aluminium avec joint d'étanchéité et butoirs invisibles pivotants
•  Coulisses aluminium avec joints antibruit, sans arrêts bas ; 53 x 21 jusqu'à la limite en classe 2, puis 68 x 21
•  Verrous automatiques (hors sangle et tirage direct)
•  Produit certifié NF : classe au vent C3 minimum (voir documentation technique)
•  Lames ADP 55 / isolante`,
  },
  {
    nom: "Rideau de verre série Standard",
    categorie: "Menuiserie",
    position: 30,
    description: `RIDEAU DE VERRE — SÉRIE STANDARD

Mesures : 3330 x 2450 mm (largeur x hauteur depuis le sol).

•  Profil compensateur, rail inférieur en saillie (option)
•  Châssis latéraux gauche et droit 40 x 20 mm
•  3 vantaux coulissants et 1 ouvrant, ouverture vers l'intérieur
•  Sans verrouillage supplémentaire
•  Verre trempé 10 mm clair
•  Profils finition RAL Standard 7016 (voir nuancier), accessoires noirs`,
  },
  {
    nom: "Solution de stockage AURA 5KWh",
    categorie: "Énergie",
    position: 40,
    description: `SOLUTION DE STOCKAGE AURA 5 kWh-BG
La gamme de stockage « tout en un »

Une conception à l'épreuve du temps qui garantit fiabilité, efficience, sécurité et longévité.

POINTS FORTS

•  Fiabilité : partenariat avec un leader mondial des batteries
•  Durabilité : garantie 10 ans ou 10 000 cycles, 80 % de décharge ; cellules prismatiques industrielles
•  Flexibilité : système modulaire, pack de 5,1 kWh, jusqu'à 25,5 kWh
•  Performance : gestion des tarifs dynamiques du marché, optimisation par données météo
•  Simplicité : solution complète, installation plug & play
•  Sécurité : disjoncteur de protection intégré, alimentation de secours ultra rapide
•  Supervision : connexion filaire ou wifi, pilotage via l'application (iOS / Android)
•  Élégance : design exclusif, version ultra fine de 24 cm d'épaisseur

SPÉCIFICATIONS

•  Sortie AC : 6 000 W
•  Batterie : LFP (LiFePO4), tension nominale 51,2 V
•  Profondeur de décharge : 90 %
•  Indice de protection : IP65
•  Plage de fonctionnement : -10 à +50 °C`,
  },
  {
    nom: "Forfait livraison sur site",
    categorie: "Forfait",
    position: 50,
    description: `FORFAIT LIVRAISON SUR SITE

•  Transport du matériel jusqu'à l'adresse du chantier
•  Déchargement et dépose de la structure sur la zone de stockage ou d'installation
•  Contrôle de la marchandise à la réception`,
  },
  {
    nom: "Forfait pose et mise en service – Structure aluminium",
    categorie: "Forfait",
    position: 60,
    description: `FORFAIT POSE ET MISE EN SERVICE — STRUCTURE ALUMINIUM

Prestation incluse :

•  Préparation et repérage : contrôle des supports (dalle, massif béton ou façade), vérification des niveaux et traçage des implantations
•  Assemblage de la structure : montage sur site de l'ossature aluminium (poteaux, traverses, chéneaux) selon les préconisations du fabricant
•  Ancrage et fixation : fixation structurelle au sol et/ou au mur (chevilles mécaniques ou scellement chimique adaptés au support)
•  Pose de la couverture : installation des éléments de toit (lames bioclimatiques, plaques polycarbonate, panneaux sandwich ou vitrage)
•  Étanchéité et évacuation : joints périphériques et évacuation des eaux pluviales (descentes d'eau dans les poteaux)
•  Raccordements (si motorisation / LED) : raccordement électrique sur l'attente mise à disposition par le client
•  Contrôle et finition : réglages, essais de fonctionnement, nettoyage du chantier et évacuation des déchets d'emballage`,
  },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL n'est pas défini. Renseignez .env.local.");
  }

  const client = postgres(connectionString, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });

  console.log("Seed du catalogue de produits…");
  for (const p of PRODUITS) {
    // Idempotent : upsert par nom (pas de clé unique → select puis insert/update).
    const existing = await db
      .select({ id: produitsCatalogue.id })
      .from(produitsCatalogue)
      .where(eq(produitsCatalogue.nom, p.nom));

    if (existing.length > 0) {
      await db
        .update(produitsCatalogue)
        .set({
          description: p.description,
          categorie: p.categorie,
          position: p.position,
        })
        .where(eq(produitsCatalogue.id, existing[0].id));
      console.log(`  • ${p.nom} — mis à jour`);
    } else {
      await db.insert(produitsCatalogue).values({
        nom: p.nom,
        description: p.description,
        categorie: p.categorie,
        position: p.position,
        tva: "20",
      });
      console.log(`  ✓ ${p.nom} — créé`);
    }
  }

  await client.end();
  console.log("Terminé.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
