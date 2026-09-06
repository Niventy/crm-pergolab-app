import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  numeric,
  date,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const leadStatutEnum = pgEnum("lead_statut", [
  "en_cours",
  "gagnee",
  "perdue",
]);

export const rdvTypeEnum = pgEnum("rdv_type", ["physique", "visio"]);

export const rdvStatutEnum = pgEnum("rdv_statut", [
  "prevu",
  "a_reprogrammer",
  "honore",
]);

// Raison de perte (statut perdu) — pour analyser les KO.
export const raisonPerteEnum = pgEnum("raison_perte", [
  "prix",
  "delai",
  "concurrent",
  "injoignable",
  "annule",
  "non_qualifie",
  "autre",
]);

// Mode de paiement choisi (aligné sur le configurateur du site).
export const modePaiementEnum = pgEnum("mode_paiement", [
  "comptant",
  "financement_60",
  "financement_120",
]);

// Type de pose de la pergola.
export const typePoseEnum = pgEnum("type_pose", ["autoportee", "adossee"]);

// ---------------------------------------------------------------------------
// profiles — lié à Supabase Auth (auth.users.id)
// ---------------------------------------------------------------------------
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(), // = auth.users.id
  email: text("email").notNull(),
  nom: text("nom"),
  // "admin" = voit les secrets (marge, coût fournisseur, trésorerie) ;
  // "membre" (ADV) = ses outils de vente uniquement.
  role: text("role").notNull().default("membre"),
  // Objectif de CA mensuel (HT) fixé par l'admin → barre de progression.
  objectifMensuel: numeric("objectif_mensuel", { precision: 12, scale: 2 }),
});

// ---------------------------------------------------------------------------
// stages — étapes du pipeline (modifiables)
// ---------------------------------------------------------------------------
export const stages = pgTable("stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  nom: text("nom").notNull(),
  // Clé STABLE référencée par le code (a_traiter, devis_envoye, a_metrer…) :
  // le nom est libre et modifiable par l'équipe sans rien casser.
  code: text("code"),
  position: integer("position").notNull(),
  couleur: text("couleur").notNull().default("#94a3b8"),
  // Cycle de vente : 1 = prospection, 2 = devis & closing.
  cycle: integer("cycle").notNull().default(1),
  isGagnee: boolean("is_gagnee").notNull().default(false),
  isPerdue: boolean("is_perdue").notNull().default(false),
});

// ---------------------------------------------------------------------------
// leads — prospects
// ---------------------------------------------------------------------------
export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),

  stageId: uuid("stage_id").references(() => stages.id, {
    onDelete: "set null",
  }),
  assignedTo: uuid("assigned_to").references(() => profiles.id, {
    onDelete: "set null",
  }),

  nom: text("nom").notNull(),
  entreprise: text("entreprise"),
  // Client PROFESSIONNEL : `entreprise` = raison sociale, + SIRET et n° de TVA
  // intracommunautaire (portés sur le devis / la facture). Côté Pennylane, un
  // pro est créé en `company_customer` (et non `individual_customer`).
  siret: text("siret"),
  tvaIntracom: text("tva_intracom"),
  email: text("email"),
  telephone: text("telephone"),

  source: text("source"),
  campagne: text("campagne"),

  montant: numeric("montant", { precision: 12, scale: 2 }),
  probabilite: integer("probabilite"),
  objectifDate: date("objectif_date"),

  typeProjet: text("type_projet"),
  adresse: text("adresse"), // rue (facturation client)
  ville: text("ville"),
  codePostal: text("code_postal"),
  // Texte libre (ex. « le plus rapidement possible », « après-midi 14h-18h »)
  // car Meta envoie souvent des créneaux, pas des dates.
  dateInstallation: text("date_installation"),
  dateSouhaiteeAppel: text("date_souhaitee_appel"),

  statut: leadStatutEnum("statut").notNull().default("en_cours"),

  rdvDate: date("rdv_date"),
  rdvType: rdvTypeEnum("rdv_type"),
  rdvStatut: rdvStatutEnum("rdv_statut"),
  rdvHeure: text("rdv_heure"), // « HH:MM » (optionnel) → évènement Google Agenda horaire
  rdvEventId: text("rdv_event_id"), // id de l'évènement Google Agenda lié

  // Pennylane : ids du client + devis créés à la signature (évite les doublons).
  pennylaneCustomerId: text("pennylane_customer_id"),
  // « individual » | « company » : pour cibler la bonne route API à la mise à jour.
  pennylaneCustomerType: text("pennylane_customer_type"),
  pennylaneQuoteId: text("pennylane_quote_id"),

  nextRelanceDate: date("next_relance_date"),
  relanceCount: integer("relance_count").notNull().default(0),

  // Le contact a déjà rempli le formulaire auparavant (re-soumission).
  resoumission: boolean("resoumission").notNull().default(false),

  // --- Métriques commerciales ---
  // Date du 1er contact (pour mesurer le délai de rappel / speed-to-lead).
  datePremierContact: timestamp("date_premier_contact", { withTimezone: true }),
  raisonPerte: raisonPerteEnum("raison_perte"),
  modePaiement: modePaiementEnum("mode_paiement"),
  // (l'ancien `acompte` a été supprimé — décision du 05/09/2026 : seule la
  // valeur « Acompte encaissé » du bloc Encaissement fait foi)
  // Coût d'achat fournisseur → marge = montant - montantAchat.
  montantAchat: numeric("montant_achat", { precision: 12, scale: 2 }),
  // Date de signature (fixée au passage en « gagnée ») → CA/marge par période.
  dateSignature: date("date_signature"),

  // --- Suivi de commande / encaissement (remplace le tableau de facturation) ---
  montantTtc: numeric("montant_ttc", { precision: 12, scale: 2 }),
  acompteEncaisse: numeric("acompte_encaisse", { precision: 12, scale: 2 }),
  paiementEspece: numeric("paiement_espece", { precision: 12, scale: 2 }),
  financeur: text("financeur"), // ex. SOFINCO (complète mode_paiement)
  equipePose: text("equipe_pose"), // nom libre de l'équipe de pose
  mesure: text("mesure"), // nombre de kilo / métré
  // Dossier administratif : factures de solde + date d'envoi du dossier.
  factureSoldeClient: boolean("facture_solde_client").notNull().default(false),
  factureSoldePoseur: boolean("facture_solde_poseur").notNull().default(false),
  dossierDateEnvoi: date("dossier_date_envoi"),

  // --- Produit / configurateur ---
  gamme: text("gamme"), // Essentia / Horizon / Signature / Sur mesure
  dimensions: text("dimensions"),
  finition: text("finition"),
  options: text("options"),
  typePose: typePoseEnum("type_pose"),

  // --- Cycle 3 : pose & technique ---
  poseAssignedTo: uuid("pose_assigned_to").references(() => profiles.id, {
    onDelete: "set null",
  }),
  dateMetre: date("date_metre"),
  fournisseur: text("fournisseur"),
  refCommande: text("ref_commande"),
  dateCommande: date("date_commande"),
  dateLivraisonPrevue: date("date_livraison_prevue"),
  dateLivraisonReelle: date("date_livraison_reelle"),
  datePosePrevue: date("date_pose_prevue"),
  datePoseReelle: date("date_pose_reelle"),
  adressePose: text("adresse_pose"),

  // Suivi de la dernière modification (qui / quand) — affiché sur les cartes
  // car l'équipe oublie parfois d'ajouter une note après avoir traité un lead.
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedBy: uuid("updated_by").references(() => profiles.id, {
    onDelete: "set null",
  }),

  // Corbeille : une fiche « supprimée » est masquée partout mais conservée
  // (restaurable par un admin). La suppression définitive purge la ligne.
  deletedAt: timestamp("deleted_at", { withTimezone: true }),

  rawPayload: jsonb("raw_payload"),
});

// ---------------------------------------------------------------------------
// notes
// ---------------------------------------------------------------------------
export const notes = pgTable("notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => profiles.id, {
    onDelete: "set null",
  }),
  contenu: text("contenu").notNull(),
  // Profils @mentionnés dans le message (pour notifications futures).
  mentions: uuid("mentions").array(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// echanges — journal des contacts
// ---------------------------------------------------------------------------
export const echanges = pgTable("echanges", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => profiles.id, {
    onDelete: "set null",
  }),
  // Clé d'activité : "appel" | "relance" | "email" | "rdv_honore" |
  // "devis_envoye" | "autre" (libellé libre stocké dans contenu).
  type: text("type").notNull(),
  contenu: text("contenu"),
  date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// devis
// ---------------------------------------------------------------------------
export const devis = pgTable("devis", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  numero: text("numero"),
  montant: numeric("montant", { precision: 12, scale: 2 }), // HT, remise déduite
  // TTC calculé ligne par ligne (chaque ligne à SON taux) : c'est la base de la
  // facturation (acompte = % du TTC) et du reste à encaisser.
  montantTtc: numeric("montant_ttc", { precision: 12, scale: 2 }),
  // Instantané des lignes (designation, quantite, prixHt, tva, remisePct) pour
  // facturer PAR TAUX sans dépendre de Pennylane, et rouvrir le devis hors ligne.
  lignes: jsonb("lignes"),
  // Devis retenu par le client (un seul par lead) : source du montant du lead,
  // de la facturation et du CA. Renseigné à la signature.
  accepteAt: timestamp("accepte_at", { withTimezone: true }),
  // Configuration du configurateur (pergola, pergolas supplémentaires, TVA par
  // défaut, remise %) pour rouvrir le devis sans tout ressaisir.
  config: jsonb("config"),
  statut: text("statut"),
  lienExterne: text("lien_externe"),
  externalId: text("external_id"), // id du devis Pennylane (pour récupérer le PDF)
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// taches — todolist personnelle (chaque personne ne voit que les siennes)
// ---------------------------------------------------------------------------
export const taches = pgTable("taches", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  titre: text("titre").notNull(),
  echeance: date("echeance"),
  fait: boolean("fait").notNull().default(false),
  faitAt: timestamp("fait_at", { withTimezone: true }),
  // Lien optionnel vers un lead (« Rappeler M. Dupont »).
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// sur_mesure_mapping — composant du configurateur → produit Pennylane
// (pour remonter la description + lier au catalogue sur les lignes sur-mesure)
// ---------------------------------------------------------------------------
export const surMesureMapping = pgTable("sur_mesure_mapping", {
  composant: text("composant").primaryKey(), // ex. "toit_E140U", "led", "chauffage"
  productId: text("product_id"), // id du produit Pennylane (optionnel)
  description: text("description"), // description pré-stockée → injectée sur la ligne
});

// ---------------------------------------------------------------------------
// produits_catalogue — catalogue de produits/options géré dans Réglages,
// ajoutables directement en ligne de devis (nom + prix + description).
// (Remplace l'ancienne présélection Pennylane par un catalogue interne.)
// ---------------------------------------------------------------------------
export const produitsCatalogue = pgTable("produits_catalogue", {
  id: uuid("id").primaryKey().defaultRandom(),
  nom: text("nom").notNull(),
  description: text("description"),
  prixHt: numeric("prix_ht", { precision: 12, scale: 2 }),
  tva: numeric("tva", { precision: 5, scale: 2 }).notNull().default("20"),
  // Regroupement dans le menu (Pergola / Menuiserie / Énergie / Forfait / Clause…).
  categorie: text("categorie"),
  position: integer("position").notNull().default(0),
  actif: boolean("actif").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// documents — fichiers rattachés à une fiche (factures, plans, PV…),
// stockés dans le bucket Supabase Storage « documents ».
// ---------------------------------------------------------------------------
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  nom: text("nom").notNull(), // nom d'affichage (fichier original)
  chemin: text("chemin").notNull(), // chemin dans le bucket
  mime: text("mime"),
  taille: integer("taille"), // octets
  userId: uuid("user_id").references(() => profiles.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// factures — factures Pennylane rattachées à une commande client (acompte/solde)
// ---------------------------------------------------------------------------
export const factures = pgTable("factures", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "acompte" | "solde" | "finale"
  numero: text("numero"),
  externalId: text("external_id"), // id de la facture Pennylane
  montantHt: numeric("montant_ht", { precision: 12, scale: 2 }),
  // TTC réellement facturé (somme des lignes par taux) → reste à facturer juste.
  montantTtc: numeric("montant_ttc", { precision: 12, scale: 2 }),
  // Lignes facturées (une par taux de TVA) pour calculer le solde par taux.
  lignes: jsonb("lignes"),
  statut: text("statut"), // draft / finalized / supprimee (disparue de Pennylane)
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// paiements — encaissements d'une commande (un par versement : acompte,
// livraison, solde…). `leads.acompte_encaisse` / `paiement_espece` sont
// RECALCULÉS à chaque écriture (sommes) pour les lecteurs existants.
// ---------------------------------------------------------------------------
export const paiements = pgTable("paiements", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  montant: numeric("montant", { precision: 12, scale: 2 }).notNull(),
  // virement | cheque | especes | cb | financement | autre
  mode: text("mode").notNull().default("virement"),
  reference: text("reference"), // n° de chèque, libellé du virement, dossier financeur…
  userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// notifications — centre de notifications par destinataire (@mention, attribution)
// ---------------------------------------------------------------------------
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id") // destinataire
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "mention" | "attribution"
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
  acteurId: uuid("acteur_id").references(() => profiles.id, {
    onDelete: "set null",
  }),
  message: text("message").notNull(),
  lu: boolean("lu").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------
export const profilesRelations = relations(profiles, ({ many }) => ({
  leads: many(leads),
  notes: many(notes),
  echanges: many(echanges),
}));

export const stagesRelations = relations(stages, ({ many }) => ({
  leads: many(leads),
}));

export const leadsRelations = relations(leads, ({ one, many }) => ({
  stage: one(stages, {
    fields: [leads.stageId],
    references: [stages.id],
  }),
  responsable: one(profiles, {
    fields: [leads.assignedTo],
    references: [profiles.id],
  }),
  modifiePar: one(profiles, {
    fields: [leads.updatedBy],
    references: [profiles.id],
  }),
  poseur: one(profiles, {
    fields: [leads.poseAssignedTo],
    references: [profiles.id],
  }),
  notes: many(notes),
  echanges: many(echanges),
  devis: many(devis),
  documents: many(documents),
  factures: many(factures),
  paiements: many(paiements),
}));

export const paiementsRelations = relations(paiements, ({ one }) => ({
  lead: one(leads, { fields: [paiements.leadId], references: [leads.id] }),
  auteur: one(profiles, { fields: [paiements.userId], references: [profiles.id] }),
}));

export const facturesRelations = relations(factures, ({ one }) => ({
  lead: one(leads, { fields: [factures.leadId], references: [leads.id] }),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  lead: one(leads, { fields: [documents.leadId], references: [leads.id] }),
  auteur: one(profiles, {
    fields: [documents.userId],
    references: [profiles.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  lead: one(leads, { fields: [notifications.leadId], references: [leads.id] }),
  acteur: one(profiles, {
    fields: [notifications.acteurId],
    references: [profiles.id],
  }),
}));

export const notesRelations = relations(notes, ({ one }) => ({
  lead: one(leads, { fields: [notes.leadId], references: [leads.id] }),
  auteur: one(profiles, { fields: [notes.userId], references: [profiles.id] }),
}));

export const echangesRelations = relations(echanges, ({ one }) => ({
  lead: one(leads, { fields: [echanges.leadId], references: [leads.id] }),
  auteur: one(profiles, {
    fields: [echanges.userId],
    references: [profiles.id],
  }),
}));

export const devisRelations = relations(devis, ({ one }) => ({
  lead: one(leads, { fields: [devis.leadId], references: [leads.id] }),
}));

export const tachesRelations = relations(taches, ({ one }) => ({
  lead: one(leads, { fields: [taches.leadId], references: [leads.id] }),
  proprietaire: one(profiles, {
    fields: [taches.userId],
    references: [profiles.id],
  }),
}));

// ---------------------------------------------------------------------------
// Types inférés
// ---------------------------------------------------------------------------
export type Profile = typeof profiles.$inferSelect;
export type Stage = typeof stages.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type Note = typeof notes.$inferSelect;
export type Echange = typeof echanges.$inferSelect;
export type Devis = typeof devis.$inferSelect;
export type Tache = typeof taches.$inferSelect;
export type ProduitCatalogue = typeof produitsCatalogue.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Facture = typeof factures.$inferSelect;
export type Paiement = typeof paiements.$inferSelect;
