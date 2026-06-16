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
  role: text("role").notNull().default("membre"),
});

// ---------------------------------------------------------------------------
// stages — étapes du pipeline (modifiables)
// ---------------------------------------------------------------------------
export const stages = pgTable("stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  nom: text("nom").notNull(),
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
  email: text("email"),
  telephone: text("telephone"),

  source: text("source"),
  campagne: text("campagne"),

  montant: numeric("montant", { precision: 12, scale: 2 }),
  probabilite: integer("probabilite"),
  objectifDate: date("objectif_date"),

  typeProjet: text("type_projet"),
  codePostal: text("code_postal"),
  // Texte libre (ex. « le plus rapidement possible », « après-midi 14h-18h »)
  // car Meta envoie souvent des créneaux, pas des dates.
  dateInstallation: text("date_installation"),
  dateSouhaiteeAppel: text("date_souhaitee_appel"),

  statut: leadStatutEnum("statut").notNull().default("en_cours"),

  rdvDate: date("rdv_date"),
  rdvType: rdvTypeEnum("rdv_type"),
  rdvStatut: rdvStatutEnum("rdv_statut"),

  nextRelanceDate: date("next_relance_date"),
  relanceCount: integer("relance_count").notNull().default(0),

  // Le contact a déjà rempli le formulaire auparavant (re-soumission).
  resoumission: boolean("resoumission").notNull().default(false),

  // --- Métriques commerciales ---
  // Date du 1er contact (pour mesurer le délai de rappel / speed-to-lead).
  datePremierContact: timestamp("date_premier_contact", { withTimezone: true }),
  raisonPerte: raisonPerteEnum("raison_perte"),
  modePaiement: modePaiementEnum("mode_paiement"),
  acompte: numeric("acompte", { precision: 12, scale: 2 }),
  // Coût d'achat fournisseur → marge = montant - montantAchat.
  montantAchat: numeric("montant_achat", { precision: 12, scale: 2 }),
  // Date de signature (fixée au passage en « gagnée ») → CA/marge par période.
  dateSignature: date("date_signature"),

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
  montant: numeric("montant", { precision: 12, scale: 2 }),
  statut: text("statut"),
  lienExterne: text("lien_externe"),
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
