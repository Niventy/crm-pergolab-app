// Feuille de route du projet affichée au client (espace client). Chaque étape
// est déduite des DONNÉES de la fiche (devis signé, validation, paiements,
// dates, étape cycle 3), pas seulement du nom de l'étape CRM : une étape est
// « faite » dès que sa preuve existe. Étape en cours = 1ʳᵉ non faite.
// Module PUR.
import { STAGE } from "@/lib/pipeline";

export type EtapeRoute = {
  cle: string;
  label: string;
  fait: boolean;
  detail: string | null; // date / précision sous le libellé
};

// Rang des étapes chantier (cycle 3), pour « a atteint X ».
const ORDRE: string[] = [
  STAGE.A_METRER,
  STAGE.METRE_REALISE,
  STAGE.COMMANDE_FOURNISSEUR,
  STAGE.EN_LIVRAISON,
  STAGE.POSE_PLANIFIEE,
  STAGE.POSEE,
  STAGE.SAV,
];

export function feuilleDeRoute(f: {
  stageCode: string | null;
  devisAccepteLe: string | null; // YYYY-MM-DD (Paris)
  validation: { statut: string; reponduLe: string | null } | null;
  premierPaiement: { date: string; montant: number } | null;
  dateLivraisonPrevue: string | null;
  dateLivraisonPrevueFin: string | null; // fourchette « entre le … et le … »
  dateLivraisonReelle: string | null;
  datePosePrevue: string | null;
  datePoseReelle: string | null;
  solde: boolean; // TTC connu et entièrement réglé
  resteTtc: number | null;
  today: string; // YYYY-MM-DD (Paris)
  fmtDate: (ymd: string) => string;
  fmtEuros: (n: number) => string;
}): EtapeRoute[] {
  const rang = f.stageCode ? ORDRE.indexOf(f.stageCode) : -1;
  const atteint = (code: string) => rang >= 0 && rang >= ORDRE.indexOf(code);
  const d = (x: string | null) => (x ? f.fmtDate(x) : null);
  const prevue =
    f.dateLivraisonPrevue && f.dateLivraisonPrevueFin && f.dateLivraisonPrevueFin !== f.dateLivraisonPrevue
      ? `entre le ${d(f.dateLivraisonPrevue)} et le ${d(f.dateLivraisonPrevueFin)}`
      : f.dateLivraisonPrevue
        ? `le ${d(f.dateLivraisonPrevue)}`
        : null;

  const validee = f.validation?.statut === "validee" || atteint(STAGE.COMMANDE_FOURNISSEUR);
  const livre = !!f.dateLivraisonReelle && f.dateLivraisonReelle <= f.today;
  const livree = livre || atteint(STAGE.POSE_PLANIFIEE);
  const posee = atteint(STAGE.POSEE);

  return [
    {
      cle: "devis",
      label: "Devis accepté",
      fait: true, // fiche client = devis signé
      detail: f.devisAccepteLe ? `Le ${f.fmtDate(f.devisAccepteLe)}` : null,
    },
    {
      cle: "schema",
      label: "Validation du schéma technique",
      fait: validee,
      detail:
        f.validation?.statut === "validee" && f.validation.reponduLe
          ? `Validé le ${f.fmtDate(f.validation.reponduLe)}`
          : validee
            ? null
            : "À faire : configurez votre pergola ci-dessus pour valider votre schéma",
    },
    {
      cle: "acompte",
      label: "Acompte accepté",
      fait: !!f.premierPaiement,
      detail: f.premierPaiement
        ? `${f.fmtEuros(f.premierPaiement.montant)} reçu le ${f.fmtDate(f.premierPaiement.date)}`
        : null,
    },
    {
      cle: "delai",
      label: "Délai de livraison",
      fait: !!(f.dateLivraisonPrevue || f.dateLivraisonReelle) || livree,
      detail:
        f.dateLivraisonPrevue && !livree
          ? `Livraison prévue ${prevue}`
          : atteint(STAGE.COMMANDE_FOURNISSEUR) && !livree
            ? "Votre pergola est en fabrication"
            : null,
    },
    {
      cle: "livraison",
      label: "Date de livraison",
      fait: livree,
      detail:
        f.dateLivraisonReelle && livre
          ? `Livrée le ${d(f.dateLivraisonReelle)}`
          : !livree && f.dateLivraisonPrevue
            ? `Prévue ${prevue}`
            : null,
    },
    {
      cle: "installation",
      label: "Installation réalisée",
      fait: posee,
      detail: posee
        ? f.datePoseReelle
          ? `Le ${d(f.datePoseReelle)}`
          : null
        : f.datePosePrevue
          ? `Pose prévue le ${d(f.datePosePrevue)}`
          : null,
    },
    {
      cle: "dossier",
      label: "Dossier finalisé",
      fait: posee && f.solde,
      detail:
        posee && !f.solde && f.resteTtc != null && f.resteTtc > 0
          ? `Reste à régler : ${f.fmtEuros(f.resteTtc)}`
          : null,
    },
  ];
}
