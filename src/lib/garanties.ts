// Calcul des garanties d'une pergola posée (dérivé, aucune donnée stockée).
// Point de départ : date de pose réelle si connue, sinon date de signature.
// Structure aluminium = 25 ans · Motorisation = 5 ans.

export const GARANTIE_STRUCTURE_ANS = 25;
export const GARANTIE_MOTORISATION_ANS = 5;

export type GarantieStatut = "active" | "bientot" | "expiree" | "inconnue";

export type Garanties = {
  depart: string | null; // "YYYY-MM-DD" utilisé pour le calcul
  source: "pose" | "signature" | null;
  structureFin: string | null;
  motorisationFin: string | null;
  structureStatut: GarantieStatut;
  motorisationStatut: GarantieStatut;
};

function addYears(dateStr: string, years: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCFullYear(dt.getUTCFullYear() + years);
  return dt.toISOString().slice(0, 10);
}

const SIX_MOIS_MS = 1000 * 60 * 60 * 24 * 182;

function statutDe(finStr: string | null): GarantieStatut {
  if (!finStr) return "inconnue";
  const fin = new Date(`${finStr}T00:00:00Z`).getTime();
  const now = Date.now();
  if (fin < now) return "expiree";
  if (fin - now < SIX_MOIS_MS) return "bientot";
  return "active";
}

export function computeGaranties(opts: {
  datePoseReelle?: string | null;
  dateSignature?: string | null;
}): Garanties {
  const depart = opts.datePoseReelle || opts.dateSignature || null;
  const source = opts.datePoseReelle
    ? "pose"
    : opts.dateSignature
      ? "signature"
      : null;
  const structureFin = depart ? addYears(depart, GARANTIE_STRUCTURE_ANS) : null;
  const motorisationFin = depart
    ? addYears(depart, GARANTIE_MOTORISATION_ANS)
    : null;
  return {
    depart,
    source,
    structureFin,
    motorisationFin,
    structureStatut: statutDe(structureFin),
    motorisationStatut: statutDe(motorisationFin),
  };
}

export const GARANTIE_STATUT_LABEL: Record<GarantieStatut, string> = {
  active: "Sous garantie",
  bientot: "Bientôt expirée",
  expiree: "Expirée",
  inconnue: "—",
};
