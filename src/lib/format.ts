const euros = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

// Montant en euros, sans décimales. Accepte string (numeric) ou number.
export function formatEuros(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return euros.format(n);
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

export function initiales(nom: string | null | undefined): string {
  if (!nom) return "?";
  return nom
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
