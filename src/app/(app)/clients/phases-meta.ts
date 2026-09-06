// Définitions PURES de l'espace Clients (types, badges, règle d'encaissement),
// importables côté client. Les requêtes serveur sont dans ./phases.ts.

// ---------------------------------------------------------------------------
// UN SEUL statut pour un client : son ÉTAPE de chantier (cycle 3). L'état
// d'encaissement (rien reçu / acompte reçu / soldé) n'est plus un onglet mais
// un BADGE + un filtre — avant, les deux se contredisaient (« SAV » = soldé
// dans l'onglet, « SAV » = après-vente dans l'étape).
// ---------------------------------------------------------------------------
export type Phase = "commande" | "facturation" | "sav";

export const PHASE_META: Record<Phase, { label: string; cls: string; dot: string }> = {
  commande: { label: "À encaisser", cls: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
  facturation: { label: "Acompte reçu", cls: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
  sav: { label: "Soldé", cls: "bg-green-100 text-green-700", dot: "bg-green-600" },
};

export const PHASE_ORDER: Phase[] = ["commande", "facturation", "sav"];

// Base à encaisser = TTC UNIQUEMENT (ce que paie le client). TTC inconnu ⇒ on
// ne peut pas conclure « soldé ».
export function phaseDe(r: {
  montantTtc: number | null;
  acompteEncaisse: number | null;
  paiementEspece: number | null;
}): Phase {
  const enc = (r.acompteEncaisse ?? 0) + (r.paiementEspece ?? 0);
  if (enc <= 0) return "commande";
  if (r.montantTtc == null) return "facturation";
  if (r.montantTtc - enc > 0.5) return "facturation";
  return "sav";
}

export type StageOption = {
  id: string;
  nom: string;
  couleur: string;
  position: number;
  isPerdue: boolean;
};

export type CommandeRow = {
  id: string;
  dateCde: string; // "YYYY-MM-DD"
  statut: string; // gagnee | perdue (commande annulée)
  commercial: string | null;
  assignedTo: string | null;
  poseAssignedTo: string | null;
  equipePose: string | null;
  nom: string;
  telephone: string | null;
  codePostal: string | null;
  ville: string | null;
  produit: string | null;
  montantHt: number | null;
  montantTtc: number | null;
  acompteEncaisse: number | null;
  paiementEspece: number | null;
  montantAchat: number | null; // admin only
  financeur: string | null;
  modePaiement: string | null;
  factureSoldeClient: boolean;
  factureSoldePoseur: boolean;
  dossierDateEnvoi: string | null;
  dateMetre: string | null;
  dateLivraisonPrevue: string | null;
  datePosePrevue: string | null;
  datePoseReelle: string | null;
  updatedAt: string; // ISO
  stageId: string | null;
  stageNom: string | null;
  stageCouleur: string | null;
  phase: Phase;
};
