import { humanise } from "@/lib/format";

// Réponses du formulaire (Meta Lead Ads) telles que le prospect les a saisies :
// l'accroche de l'appel. Elles dormaient dans `raw_payload` sans être affichées.
// On EXCLUT les champs techniques ET ceux déjà repris dans la fiche (identité,
// code postal, dimensions, créneau, installation…) : ils sont dans « Coordonnées
// & projet », éditables — pas de doublon.
const TECHNIQUES = new Set([
  "id", "lead_id", "leadgen_id", "form_id", "form_name", "ad_id", "adset_id", "campaign_id",
  "page_id", "page_name", "created_time", "created_at", "date_created", "sheet_date",
  "date_creation", "platform", "plateforme", "is_organic", "field_data", "fields",
  "form_response", "raw", "source", "adgroup_id", "ad_name", "adset_name", "campaign_name",
  "campagne", "email", "email_address", "mail", "telephone", "téléphone", "phone",
  "phone_number", "tel", "nom", "full_name", "name", "full name", "first_name", "last_name",
  "prenom", "prénom", "nom_famille", "codepostal", "code_postal", "code postal", "zip",
  "postal_code", "cp",
  // déjà mappés dans la fiche par le webhook (inbound/route.ts)
  "typeprojet", "type_projet", "type de projet", "type_de_projet", "projet",
  "dimensions", "dimension", "taille", "gamme",
  "datesouhaiteeappel", "date_souhaitee_appel", "creneau", "créneau", "horaire", "disponibilite",
  "dateinstallation", "date_installation", "installation", "delai", "délai",
  // ciblage publicitaire : le client final s'en fiche (audience « BROAD », UTM…)
  "audience", "audience_name", "adset", "ad_set", "targeting", "lead_status",
  "fbclid", "ip", "user_agent", "row", "sheet", "form",
]);
// Préfixes techniques (ciblage, tracking) exclus quelle que soit la suite.
const PREFIXES_TECHNIQUES = /^(utm_|ad_|adset|audience|campaign|form_|page_|lead_|fb_|ig_)/i;

const LABELS: Record<string, string> = {
  typeprojet: "Type de projet",
  type_projet: "Type de projet",
  type_de_projet: "Type de projet",
  projet: "Projet",
  dimensions: "Dimensions",
  dimension: "Dimensions",
  taille: "Taille",
  gamme: "Gamme",
  datesouhaiteeappel: "Créneau d'appel souhaité",
  date_souhaitee_appel: "Créneau d'appel souhaité",
  creneau: "Créneau d'appel souhaité",
  créneau: "Créneau d'appel souhaité",
  horaire: "Horaire souhaité",
  disponibilite: "Disponibilité",
  dateinstallation: "Installation souhaitée",
  date_installation: "Installation souhaitée",
  installation: "Installation souhaitée",
  delai: "Délai",
  délai: "Délai",
  budget: "Budget",
  surface: "Surface",
  ville: "Ville",
  city: "Ville",
  adresse: "Adresse",
  message: "Message",
  commentaire: "Commentaire",
  question: "Question",
};

function flatten(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return {};
  const obj = payload as Record<string, unknown>;
  const fd = obj.field_data ?? obj.fields ?? obj.form_response;
  const flat: Record<string, unknown> = { ...obj };
  if (Array.isArray(fd)) {
    for (const f of fd as Array<Record<string, unknown>>) {
      const name = typeof f.name === "string" ? f.name : undefined;
      const values = f.values ?? f.value;
      if (name) flat[name] = Array.isArray(values) ? values.join(", ") : values;
    }
  }
  return flat;
}

export function extraireReponsesMeta(payload: unknown): { label: string; valeur: string }[] {
  const flat = flatten(payload);
  const out: { label: string; valeur: string }[] = [];
  for (const [k, v] of Object.entries(flat)) {
    const key = k.trim();
    if (TECHNIQUES.has(key.toLowerCase()) || PREFIXES_TECHNIQUES.test(key)) continue;
    if (v == null || typeof v === "object") continue;
    const s = String(v).trim();
    if (!s) continue;
    const label =
      LABELS[key.toLowerCase().replace(/\s+/g, "_")] ??
      key.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
    out.push({ label, valeur: humanise(s) });
  }
  return out;
}

export function MetaReponses({ payload }: { payload: unknown }) {
  const reponses = extraireReponsesMeta(payload);
  if (reponses.length === 0) return null;
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
      {reponses.map((r, i) => (
        <div key={i} className="rounded-md bg-muted/40 px-2.5 py-1.5">
          <dt className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">{r.label}</dt>
          <dd className="text-sm text-foreground">{r.valeur}</dd>
        </div>
      ))}
    </dl>
  );
}
