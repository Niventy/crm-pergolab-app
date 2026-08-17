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

const PRODUITS: Seed[] = [
  {
    nom: "Store Zip motorisé",
    categorie: "Option",
    position: 10,
    description: `Optimisez votre espace extérieur avec notre store zip motorisé pour pergola !

Alliez confort, design et technologie grâce à notre store zip spécialement conçu pour pergolas. Facile à manipuler grâce à sa motorisation A-OK compatible 110V ou 220V, il se commande simplement à distance via une télécommande, pour un usage pratique au quotidien.

Sa toile technique, composée de 30% polyester et 70% PVC, vous protège efficacement du vent et de la pluie tout en laissant passer la lumière naturelle avec une transparence maîtrisée de 5%. La fermeture éclair des deux côtés assure une installation impeccable et une meilleure résistance face aux intempéries.

Caractéristiques principales :
* Motorisation : A-OK AC110V ou 220V, télécommande incluse
* Fermeture : Fermeture éclair (zip) des deux côtés
* Protection : Résistant au vent et à l'eau
* Toile : Composée de 30% polyester et 70% PVC, offrant une transparence de 5%`,
  },
  {
    nom: "VR Rénobloc® ADP 55",
    categorie: "Menuiserie",
    position: 20,
    description: `Coffre pan coupé ou 1/4 de rond.
* Tablier ajouré sauf : - en tirage direct ; - en alu filé
* Lame finale aluminium avec joint d'étanchéité et équipée de butoirs invisibles pivotants.
* Coulisses aluminium avec joints antibruit, sans arrêts bas. Coulisses 53 x 21 jusqu'à la limite en classe 2, puis passage en coulisses 68 x 21.
* Verrous automatiques (hors sangle et tirage direct).
* Produit certifié NF : classe au vent C3 minimum, voir détail dans la documentation technique.
* Lames ADP 55 / Isolante`,
  },
  {
    nom: "Rideau de verre série Standard",
    categorie: "Menuiserie",
    position: 30,
    description: `Mesures 3330 mm x 2450 H (largeur x hauteur depuis le sol).

Avec profil compensateur, rail inférieur option en saillie, avec châssis latéral gauche 40 x 20 mm, avec châssis latéral droit 40 x 20 mm.

Avec 3 vantaux coulissants et 1 ouvrant, actionnés par : ouverture vers l'intérieur.

Sans verrouillage supplémentaire.

Verre trempé 10 mm clair, finition des profils en RAL Standard 7016 (voir nuancier). Couleur des accessoires en Noir.`,
  },
  {
    nom: "Solution de stockage AURA 5KWh",
    categorie: "Énergie",
    position: 40,
    description: `SOLUTION DE STOCKAGE AURA 5KWh-BG

La nouvelle gamme de stockage « tout en un » emploie les technologies les plus avancées. Sa conception à l'épreuve du temps vous garantit fiabilité, efficience, sécurité et longévité.

* Fiabilité : partenariat avec un leader mondial des batteries.
* Durabilité : garantie 10 ans ou 10 000 cycles – 80 % de décharge. Cellules et technologies prismatiques industrielles.
* Flexibilité : système modulaire, pack de batteries de 5,1 kWh, installation jusqu'à 25,5 kWh.
* Performance : gestion des tarifs dynamique du marché, optimisation par données météo.
* Simplicité : solution complète tout en un, installation plug & play.
* Sécurité : disjoncteur de protection intégré, alimentation de secours ultra rapide.
* Supervision : connexion filaire ou wifi, pilotage depuis l'application (iOS / Android).
* Élégance : design exclusif, version ultra fine – 24 cm d'épaisseur.

Spécifications principales : sortie AC 6 000 W, batterie LFP (LiFePO4), tension nominale 51,2 V, profondeur de décharge 90 %, IP65, plage de fonctionnement -10 à +50 °C.`,
  },
  {
    nom: "Forfait livraison sur site",
    categorie: "Forfait",
    position: 50,
    description: `Transport du matériel jusqu'à l'adresse du chantier.

Déchargement et dépose de la structure/colis sur la zone de stockage ou d'installation.

Contrôle de la marchandise à la réception.`,
  },
  {
    nom: "Forfait pose et mise en service – Structure aluminium",
    categorie: "Forfait",
    position: 60,
    description: `Descriptif de la prestation — inclus :

* Préparation et repérage : contrôle des supports (dalle, massif béton ou façade), vérification des niveaux et traçage des implantations.
* Assemblage de la structure : montage sur site de l'ossature aluminium (poteaux, traverses, chéneaux) selon les préconisations du fabricant.
* Ancrage et fixation : fixation structurelle au sol et/ou au mur (chevilles mécaniques ou scellement chimique adaptés au support).
* Pose de la couverture : installation des éléments de toit (lames bioclimatiques, plaques polycarbonate, panneaux sandwich ou vitrage).
* Étanchéité et évacuation : joints d'étanchéité périphérique et système d'évacuation des eaux pluviales (descentes d'eau dans les poteaux).
* Raccordements (si option motorisation/LED) : raccordement électrique des équipements sur l'attente électrique mise à disposition par le client.
* Contrôle et finition : réglages, essais de fonctionnement, nettoyage du chantier et évacuation des déchets d'emballage.`,
  },
  {
    nom: "Clause suspensive – faisabilité technique",
    categorie: "Clause",
    position: 70,
    description: `Le présent devis est établi sous réserve de la validation des conditions techniques lors de la visite sur site et de la prise de cotes définitives.

La réalisation du projet dépend notamment de la nature des supports, des contraintes de pose et de l'accessibilité.

En cas de contraintes techniques imprévues nécessitant une adaptation, un devis modificatif pourra être proposé.

Si aucune solution ne peut être mise en œuvre, le devis pourra être annulé sans frais, avec remboursement des sommes éventuellement versées.`,
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
