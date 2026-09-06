// Modes de paiement (pur, importable côté client et serveur).
export const MODES_PAIEMENT: { value: string; label: string }[] = [
  { value: "virement", label: "Virement" },
  { value: "cheque", label: "Chèque" },
  { value: "cb", label: "Carte bancaire" },
  { value: "especes", label: "Espèces" },
  { value: "financement", label: "Financement (organisme)" },
  { value: "autre", label: "Autre" },
];
