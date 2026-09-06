const euros = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

// Montant en euros, sans décimales. Accepte string (numeric) ou number.
// À réserver aux vues de pilotage (pipeline, KPI) : pour la facturation, utiliser
// formatEurosCents — un arrondi à l'euro y crée des écarts visibles avec Pennylane.
export function formatEuros(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return euros.format(n);
}

const eurosCents = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Montant au centime (devis, factures, encaissements).
export function formatEurosCents(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return eurosCents.format(n);
}

const PARIS = "Europe/Paris";
const ymdParisFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: PARIS,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// « YYYY-MM-DD » d'un horodatage, en heure de PARIS. À utiliser partout à la
// place de toISOString().slice(0, 10) : un lead reçu le 1ᵉʳ à 00 h 30 (Paris)
// était classé la veille (UTC) dans le Kanban, la Liste et le Dashboard.
export function ymdParis(value: Date | string | number = new Date()): string {
  const d = value instanceof Date ? value : new Date(value);
  return ymdParisFmt.format(d); // en-CA → YYYY-MM-DD
}

// « YYYY-MM » (mois de réception) en heure de Paris.
export function ymParis(value: Date | string | number): string {
  return ymdParis(value).slice(0, 7);
}

// Aujourd'hui à Paris, « YYYY-MM-DD ».
export function todayParis(): string {
  return ymdParis(new Date());
}

const MOIS_FR_MAJ = [
  "JANVIER", "FÉVRIER", "MARS", "AVRIL", "MAI", "JUIN",
  "JUILLET", "AOÛT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DÉCEMBRE",
];

// Libellé d'un mois « YYYY-MM » : « JUIN 2026 » (ou « JUIN 26 » en court).
// Une seule définition pour Kanban / Liste / Clients (3 copies divergentes avant).
export function moisLabelFr(key: string, court = false): string {
  const [y, m] = key.split("-");
  const nom = MOIS_FR_MAJ[Number(m) - 1] ?? key;
  return `${nom} ${court ? y.slice(2) : y}`;
}

// Date courte JJ/MM (sans année), à partir d'une date "YYYY-MM-DD".
export function formatDateCourte(value: string | null | undefined): string {
  if (!value) return "";
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}`;
}

// Date longue JJ/MM/AAAA.
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

// Date d'un horodatage (timestamp Date/string) en JJ/MM/AAAA.
export function formatHorodatage(
  value: Date | string | number | null | undefined,
): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Paris",
  });
}

// Temps écoulé depuis une date, en français abrégé : « à l'instant », « 2 h »,
// « 3 j », sinon date courte. Accepte Date | string | number.
export function tempsRelatif(value: Date | string | number | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  const diffMs = Date.now() - d.getTime();
  if (Number.isNaN(diffMs)) return "";
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const j = Math.floor(h / 24);
  if (j < 30) return `${j} j`;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

// Les valeurs venant de Meta arrivent souvent avec des underscores à la place
// des espaces (« le_plus_rapidement_possible »). On les rend lisibles.
export function humanise(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/_/g, " ").trim();
}

// Téléphone AFFICHÉ à la française : « 33658243361 » / « +33 6 58… » / « 0658243361 »
// → « 06 58 24 33 61 ». La donnée stockée n'est pas modifiée ; un numéro
// étranger ou atypique est rendu tel quel.
export function formatTelephone(value: string | null | undefined): string {
  if (!value) return "";
  let d = value.replace(/\D/g, "");
  if (d.startsWith("0033")) d = d.slice(4);
  if (d.length === 11 && d.startsWith("33")) d = `0${d.slice(2)}`;
  if (d.length === 10 && d.startsWith("0")) return d.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  return value.trim();
}

// Lien `tel:` international (+33…) pour que l'appel parte correctement depuis
// un mobile, quel que soit le format saisi.
export function telHref(value: string | null | undefined): string {
  if (!value) return "";
  let d = value.replace(/\D/g, "");
  if (d.startsWith("0033")) d = d.slice(4);
  if (d.length === 11 && d.startsWith("33")) return `tel:+${d}`;
  if (d.length === 10 && d.startsWith("0")) return `tel:+33${d.slice(1)}`;
  return `tel:${value.replace(/[^+\d]/g, "")}`;
}

export function initiales(nom: string | null | undefined): string {
  if (!nom) return "?";
  return nom
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
