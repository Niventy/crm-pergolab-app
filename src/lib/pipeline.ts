// Règles du pipeline partagées client / serveur (pur, sans DB).

export type StageLike = {
  cycle: number;
  isGagnee: boolean;
  isPerdue: boolean;
};

export type Statut = "en_cours" | "gagnee" | "perdue";

// Statut dérivé de l'étape — UNE seule définition (elle était dupliquée 5 fois).
// perdue prime (KO, Annulée) ; « gagnée » est COLLANT sur tout le cycle 3.
export function statutPourStage(stage: StageLike): Statut {
  if (stage.isPerdue) return "perdue";
  if (stage.isGagnee || stage.cycle === 3) return "gagnee";
  return "en_cours";
}

// Cycles de vente.
export const CYCLE_PROSPECTION = 1;
export const CYCLE_CLOSING = 2;
export const CYCLE_CHANTIER = 3;

// Clés stables des étapes (colonne stages.code). Le code s'appuie sur ces clés,
// jamais sur le nom affiché — l'équipe peut renommer une étape librement.
export const STAGE = {
  A_TRAITER: "a_traiter",
  PAS_DE_REPONSE: "pas_de_reponse",
  RAPPELER: "rappeler",
  RDV_TEL: "rdv_telephonique",
  DEVIS_A_ENVOYER: "devis_a_envoyer",
  HORS_ZONE_KO: "hors_zone_ko",
  NON_QUALIFIE_KO: "non_qualifie_ko",
  RENDEZ_VOUS: "rendez_vous",
  DEVIS_ENVOYE: "devis_envoye",
  SIGNEE: "signee",
  KO: "ko",
  A_METRER: "a_metrer",
  METRE_REALISE: "metre_realise",
  COMMANDE_FOURNISSEUR: "commande_fournisseur",
  EN_LIVRAISON: "en_livraison",
  POSE_PLANIFIEE: "pose_planifiee",
  POSEE: "posee",
  SAV: "sav",
  ANNULEE: "annulee",
} as const;

export type StageCode = (typeof STAGE)[keyof typeof STAGE];

// Nom par défaut → code (seed + migration des étapes existantes).
export const STAGE_CODE_PAR_NOM: Record<string, StageCode> = {
  "À traiter": STAGE.A_TRAITER,
  "Pas de réponse": STAGE.PAS_DE_REPONSE,
  Rappeler: STAGE.RAPPELER,
  "RDV Téléphonique": STAGE.RDV_TEL,
  "Devis à envoyer": STAGE.DEVIS_A_ENVOYER,
  "Hors Zone KO": STAGE.HORS_ZONE_KO,
  "Non qualifié KO": STAGE.NON_QUALIFIE_KO,
  "Rendez-vous": STAGE.RENDEZ_VOUS,
  "Devis envoyé": STAGE.DEVIS_ENVOYE,
  Signée: STAGE.SIGNEE,
  KO: STAGE.KO,
  "À métrer": STAGE.A_METRER,
  "Métré réalisé": STAGE.METRE_REALISE,
  "Commande fournisseur": STAGE.COMMANDE_FOURNISSEUR,
  "En livraison": STAGE.EN_LIVRAISON,
  "Pose planifiée": STAGE.POSE_PLANIFIEE,
  Posée: STAGE.POSEE,
  SAV: STAGE.SAV,
  Annulée: STAGE.ANNULEE,
};

// Raisons de perte (enum raison_perte) — libellés partagés fiche / Kanban.
export const RAISONS_PERTE: { value: string; label: string }[] = [
  { value: "prix", label: "Prix" },
  { value: "delai", label: "Délai" },
  { value: "concurrent", label: "Concurrent" },
  { value: "injoignable", label: "Injoignable" },
  { value: "annule", label: "Projet annulé" },
  { value: "non_qualifie", label: "Non qualifié / hors zone" },
  { value: "autre", label: "Autre" },
];
