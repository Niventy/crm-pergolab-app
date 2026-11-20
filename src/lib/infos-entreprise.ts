// Informations « de confiance » affichées dans l'espace client : contacts,
// identité légale, assurance, garanties, conditions. Module PUR (client + serveur).
// Stockées dans `parametres` (clé « espace_client »), éditées dans Réglages.

export const CLE_INFOS_ESPACE = "espace_client";

export type ContactConfiance = {
  nom: string;
  role: string;
  telephone: string;
  email: string;
};

export type InfosEntreprise = {
  contacts: ContactConfiance[];
  raisonSociale: string;
  siret: string;
  tvaIntracom: string;
  adresse: string;
  telephone: string;
  email: string;
  siteWeb: string;
  assurance: string; // ex. « Décennale AXA n° 1234567 »
  garanties: string;
  conditions: string;
  lienConditions: string; // URL des CGV complètes (facultatif)
};

export const INFOS_VIDES: InfosEntreprise = {
  contacts: [
    { nom: "Sofiane Krif", role: "Votre conseiller", telephone: "", email: "" },
    { nom: "Myriam", role: "", telephone: "", email: "" },
  ],
  raisonSociale: "",
  siret: "",
  tvaIntracom: "",
  adresse: "",
  telephone: "",
  email: "",
  siteWeb: "",
  assurance: "",
  garanties: "",
  conditions: "",
  lienConditions: "",
};

const txt = (v: unknown, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// Lecture tolérante (valeur absente ou partielle → champs vides).
export function lireInfos(v: unknown): InfosEntreprise {
  if (!v || typeof v !== "object") return INFOS_VIDES;
  const o = v as Record<string, unknown>;
  const contacts = Array.isArray(o.contacts)
    ? (o.contacts as Record<string, unknown>[])
        .map((c) => ({
          nom: txt(c?.nom, 120),
          role: txt(c?.role, 120),
          telephone: txt(c?.telephone, 40),
          email: txt(c?.email, 200),
        }))
        .filter((c) => c.nom)
        .slice(0, 6)
    : INFOS_VIDES.contacts;
  return {
    contacts,
    raisonSociale: txt(o.raisonSociale, 200),
    siret: txt(o.siret, 40),
    tvaIntracom: txt(o.tvaIntracom, 40),
    adresse: txt(o.adresse, 300),
    telephone: txt(o.telephone, 40),
    email: txt(o.email, 200),
    siteWeb: txt(o.siteWeb, 300),
    assurance: txt(o.assurance, 500),
    garanties: txt(o.garanties),
    conditions: txt(o.conditions, 20000),
    lienConditions: /^https?:\/\//i.test(txt(o.lienConditions)) ? txt(o.lienConditions, 500) : "",
  };
}

// SIRET lisible : « 123 456 789 00012 ».
export function formatSiret(s: string): string {
  const d = s.replace(/\D/g, "");
  return d.length === 14 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}` : s;
}
