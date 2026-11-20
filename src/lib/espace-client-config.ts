import { resolveSender } from "@/lib/email-sender";

// Fonctions de l'espace client qui dépendent d'une clé externe. Tant qu'une clé
// manque (ou n'est qu'un emplacement « à remplir »), la fonction est MASQUÉE
// proprement au lieu d'échouer devant le client ; elle s'active d'elle-même
// quand la variable est ajoutée (Vercel → redéploiement).

// Clé service_role Supabase réelle (JWT « eyJ… » ou nouvelle clé « sb_secret_… »).
export function cleServiceRole(): string | null {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  return /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(k) || /^sb_secret_\w+/.test(k) ? k : null;
}

// Documents partageables avec le client (liens signés sans session).
export const stockageClientDisponible = () => !!cleServiceRole();

// Envoi d'emails Gmail configuré (OAuth + au moins une boîte d'envoi).
export const emailDisponible = () =>
  !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET && !!resolveSender(null);
