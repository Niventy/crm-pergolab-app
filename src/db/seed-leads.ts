import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "./schema";
import { stages, leads, profiles } from "./schema";

// Décale une date de `n` jours par rapport à aujourd'hui (format YYYY-MM-DD).
function jour(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Deux ADV de démonstration (profils non liés à l'auth, juste pour les métriques).
const ADV = [
  { id: "00000000-0000-0000-0000-0000000000a1", nom: "Sophie (ADV)", email: "sophie.adv@demo.pergolab" },
  { id: "00000000-0000-0000-0000-0000000000a2", nom: "Léa (ADV)", email: "lea.adv@demo.pergolab" },
];

type DemoLead = {
  stage: string;
  nom: string;
  entreprise?: string;
  email?: string;
  telephone?: string;
  source?: string;
  campagne?: string;
  montant?: string;
  probabilite?: number;
  typeProjet?: string;
  codePostal?: string;
  dateInstallation?: string;
  dateSouhaiteeAppel?: string;
  rdvDate?: string;
  rdvType?: "physique" | "visio";
  rdvStatut?: "prevu" | "a_reprogrammer" | "honore";
  nextRelanceDate?: string;
  relanceCount?: number;
  gamme?: string;
  // Pour les fiches signées : date de signature (CA/marge par mois).
  signeLe?: string; // YYYY-MM-DD
  creeLe?: string; // YYYY-MM-DD (sinon = maintenant)
};

const DEMO_LEADS: DemoLead[] = [
  // --- Pipeline actif (prospection / devis) ---
  { stage: "À traiter", nom: "Marie Dubois", email: "marie.dubois@gmail.com", telephone: "06 12 34 56 78", source: "Facebook Lead Ads", campagne: "Pergola Été 2026", montant: "12500.00", probabilite: 20, typeProjet: "Pergola bioclimatique", gamme: "Horizon", codePostal: "31000", dateSouhaiteeAppel: "après-midi (14h-18h)" },
  { stage: "À traiter", nom: "Julien Moreau", email: "j.moreau@outlook.fr", telephone: "06 98 76 54 32", source: "Instagram Lead Ads", campagne: "Pergola Été 2026", montant: "8900.00", probabilite: 15, typeProjet: "Pergola adossée", gamme: "Essentia", codePostal: "31400", dateSouhaiteeAppel: "matin (9h-12h)" },
  { stage: "Pas de réponse", nom: "Sophie Laurent", telephone: "07 11 22 33 44", source: "Facebook Lead Ads", campagne: "Store banne Printemps", montant: "4200.00", probabilite: 10, typeProjet: "Store banne", codePostal: "31200", relanceCount: 2, nextRelanceDate: jour(3), creeLe: "2026-05-18" },
  { stage: "Rappeler", nom: "Thomas Bernard", entreprise: "Bernard & Fils", telephone: "06 44 55 66 77", source: "Instagram Lead Ads", campagne: "Pergola Été 2026", montant: "15800.00", probabilite: 35, typeProjet: "Pergola bioclimatique XL", gamme: "Signature", codePostal: "31700", nextRelanceDate: jour(0), relanceCount: 1, creeLe: "2026-05-06" },
  { stage: "Rendez-vous", nom: "Camille Petit", email: "camille.petit@gmail.com", telephone: "06 33 22 11 00", source: "Facebook Lead Ads", campagne: "Pergola Été 2026", montant: "11200.00", probabilite: 55, typeProjet: "Pergola bioclimatique", gamme: "Horizon", codePostal: "31300", rdvDate: jour(4), rdvType: "physique", rdvStatut: "prevu" },
  { stage: "Rendez-vous", nom: "Antoine Rousseau", email: "a.rousseau@free.fr", telephone: "07 55 44 33 22", source: "Instagram Lead Ads", campagne: "Carport Auto", montant: "9700.00", probabilite: 50, typeProjet: "Carport", codePostal: "31500", rdvDate: jour(6), rdvType: "visio", rdvStatut: "prevu", creeLe: "2026-05-28" },
  { stage: "Devis à envoyer", nom: "Léa Girard", email: "lea.girard@gmail.com", telephone: "06 77 88 99 00", source: "Facebook Lead Ads", campagne: "Pergola Été 2026", montant: "13400.00", probabilite: 65, typeProjet: "Pergola bioclimatique", gamme: "Horizon", codePostal: "31100", dateInstallation: "le plus rapidement possible" },
  { stage: "Devis envoyé", nom: "Nicolas Lefevre", entreprise: "SCI Lefevre", email: "n.lefevre@gmail.com", telephone: "06 10 20 30 40", source: "Instagram Lead Ads", campagne: "Pergola Été 2026", montant: "18900.00", probabilite: 75, typeProjet: "Pergola bioclimatique XL", gamme: "Signature", codePostal: "31600", dateInstallation: "septembre 2026", nextRelanceDate: jour(5), relanceCount: 1 },
  { stage: "Devis envoyé", nom: "Julie Fabre", email: "julie.fabre@gmail.com", telephone: "06 21 22 23 24", source: "Facebook Lead Ads", campagne: "Pergola Été 2026", montant: "10300.00", probabilite: 70, typeProjet: "Pergola adossée", gamme: "Essentia", codePostal: "31200", relanceCount: 0 },

  // --- Perdus ---
  { stage: "KO", nom: "Pierre Garnier", telephone: "07 99 88 77 66", source: "Instagram Lead Ads", campagne: "Store banne Printemps", montant: "3800.00", probabilite: 0, typeProjet: "Store banne", codePostal: "31800", creeLe: "2026-04-10" },
  { stage: "KO", nom: "Olivier Roche", telephone: "06 55 11 22 33", source: "Facebook Lead Ads", campagne: "Pergola Été 2026", montant: "12000.00", probabilite: 0, typeProjet: "Pergola bioclimatique", codePostal: "31400", creeLe: "2026-03-05" },

  // --- Signés / posés (CA réparti sur l'année 2026) ---
  { stage: "Posée", nom: "Hugo Mercier", email: "hugo.mercier@gmail.com", telephone: "06 31 41 51 61", source: "Facebook Lead Ads", campagne: "Pergola Hiver 2026", montant: "16500.00", probabilite: 100, typeProjet: "Pergola bioclimatique", gamme: "Horizon", codePostal: "31000", creeLe: "2025-12-20", signeLe: "2026-01-12" },
  { stage: "Posée", nom: "Chloé Petit", email: "chloe.petit@gmail.com", telephone: "06 32 42 52 62", source: "Instagram Lead Ads", campagne: "Pergola Hiver 2026", montant: "12900.00", probabilite: 100, typeProjet: "Pergola adossée", gamme: "Essentia", codePostal: "31300", creeLe: "2026-01-08", signeLe: "2026-02-03" },
  { stage: "Posée", nom: "Maxime Robert", entreprise: "Robert SARL", email: "m.robert@gmail.com", telephone: "06 33 43 53 63", source: "Facebook Lead Ads", campagne: "Pergola Été 2026", montant: "21000.00", probabilite: 100, typeProjet: "Pergola bioclimatique XL", gamme: "Signature", codePostal: "31700", creeLe: "2026-01-22", signeLe: "2026-02-20" },
  { stage: "Pose planifiée", nom: "Inès Lambert", email: "ines.lambert@gmail.com", telephone: "06 34 44 54 64", source: "Instagram Lead Ads", campagne: "Pergola Été 2026", montant: "9800.00", probabilite: 100, typeProjet: "Pergola adossée", gamme: "Essentia", codePostal: "31500", creeLe: "2026-02-15", signeLe: "2026-03-09" },
  { stage: "Posée", nom: "Lucas Girard", email: "lucas.girard@gmail.com", telephone: "06 35 45 55 65", source: "Facebook Lead Ads", campagne: "Pergola Été 2026", montant: "14200.00", probabilite: 100, typeProjet: "Pergola bioclimatique", gamme: "Horizon", codePostal: "31100", creeLe: "2026-02-25", signeLe: "2026-03-21" },
  { stage: "Commande fournisseur", nom: "Sarah Bonnet", email: "sarah.bonnet@gmail.com", telephone: "06 36 46 56 66", source: "Instagram Lead Ads", campagne: "Pergola Été 2026", montant: "18700.00", probabilite: 100, typeProjet: "Pergola bioclimatique XL", gamme: "Signature", codePostal: "31200", creeLe: "2026-03-12", signeLe: "2026-04-05" },
  { stage: "Signée", nom: "Théo Vincent", email: "theo.vincent@gmail.com", telephone: "06 37 47 57 67", source: "Facebook Lead Ads", campagne: "Pergola Été 2026", montant: "11500.00", probabilite: 100, typeProjet: "Pergola adossée", gamme: "Essentia", codePostal: "31400", creeLe: "2026-03-28", signeLe: "2026-04-22" },
  { stage: "Signée", nom: "Manon Faure", entreprise: "Faure Immo", email: "manon.faure@gmail.com", telephone: "06 38 48 58 68", source: "Instagram Lead Ads", campagne: "Pergola Été 2026", montant: "23400.00", probabilite: 100, typeProjet: "Pergola bioclimatique XL", gamme: "Signature", codePostal: "31000", creeLe: "2026-04-18", signeLe: "2026-05-08" },
  { stage: "Signée", nom: "Émilie Fontaine", email: "emilie.fontaine@gmail.com", telephone: "06 12 13 14 15", source: "Facebook Lead Ads", campagne: "Pergola Été 2026", montant: "14600.00", probabilite: 100, typeProjet: "Pergola bioclimatique", gamme: "Horizon", codePostal: "31000", creeLe: "2026-05-02", signeLe: "2026-05-21" },
];

const MODE_PAIEMENT = ["comptant", "financement_60", "financement_120"] as const;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL n'est pas défini. Renseignez .env.local.");
  }

  const client = postgres(connectionString, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });

  // 1) Profils ADV de démo (upsert).
  for (const a of ADV) {
    const existing = await db.select().from(profiles).where(eq(profiles.id, a.id));
    if (existing.length === 0) {
      await db.insert(profiles).values({ id: a.id, email: a.email, nom: a.nom, role: "membre" });
      console.log(`  ✓ ADV « ${a.nom} » créé.`);
    } else {
      await db.update(profiles).set({ nom: a.nom, email: a.email }).where(eq(profiles.id, a.id));
    }
  }

  const allStages = await db.select().from(stages);
  const stageByName = new Map(allStages.map((s) => [s.nom, s]));

  console.log("Seed des leads de démonstration…");

  let i = 0;
  for (const lead of DEMO_LEADS) {
    const stage = stageByName.get(lead.stage);
    if (!stage) {
      console.warn(`  ! Étape introuvable : « ${lead.stage} » — lead ignoré.`);
      continue;
    }

    const statut =
      stage.isPerdue ? "perdue" : stage.isGagnee || stage.cycle === 3 ? "gagnee" : "en_cours";

    const montantNum = Number(lead.montant ?? 0);
    const montantAchat = montantNum ? (montantNum * 0.6).toFixed(2) : null;
    const acompteEncaisse =
      statut === "gagnee" && montantNum ? (montantNum * 0.3).toFixed(2) : null;
    const assignedTo = ADV[i % ADV.length].id;
    const modePaiement = MODE_PAIEMENT[i % MODE_PAIEMENT.length];
    const createdAt = lead.creeLe ? new Date(`${lead.creeLe}T10:00:00Z`) : new Date();
    const datePremierContact =
      statut !== "en_cours" || lead.rdvDate
        ? new Date(createdAt.getTime() + 36 * 60 * 60 * 1000)
        : null;

    const values = {
      stageId: stage.id,
      assignedTo,
      nom: lead.nom,
      entreprise: lead.entreprise ?? null,
      email: lead.email ?? null,
      telephone: lead.telephone ?? null,
      source: lead.source ?? null,
      campagne: lead.campagne ?? null,
      montant: lead.montant ?? null,
      montantAchat,
      acompteEncaisse,
      modePaiement: modePaiement as (typeof MODE_PAIEMENT)[number],
      probabilite: lead.probabilite ?? null,
      typeProjet: lead.typeProjet ?? null,
      gamme: lead.gamme ?? null,
      codePostal: lead.codePostal ?? null,
      dateInstallation: lead.dateInstallation ?? null,
      dateSouhaiteeAppel: lead.dateSouhaiteeAppel ?? null,
      statut: statut as "en_cours" | "gagnee" | "perdue",
      rdvDate: lead.rdvDate ?? null,
      rdvType: lead.rdvType ?? null,
      rdvStatut: lead.rdvStatut ?? null,
      nextRelanceDate: lead.nextRelanceDate ?? null,
      relanceCount: lead.relanceCount ?? 0,
      datePremierContact,
      dateSignature: lead.signeLe ?? null,
      createdAt,
    };

    const existing = await db.select().from(leads).where(eq(leads.nom, lead.nom));
    if (existing.length > 0) {
      await db.update(leads).set(values).where(eq(leads.nom, lead.nom));
      console.log(`  • « ${lead.nom} » mis à jour → ${lead.stage}`);
    } else {
      await db.insert(leads).values(values);
      console.log(`  ✓ « ${lead.nom} » → ${lead.stage}`);
    }
    i++;
  }

  console.log("Seed des leads terminé.");
  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Erreur lors du seed des leads :", err);
  process.exit(1);
});
