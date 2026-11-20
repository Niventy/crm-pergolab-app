import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { devis, leads, validationsChantier } from "@/db/schema";
import { lireMetre } from "@/lib/chantier-validation";
import {
  configDepuisDevis,
  lireConfig,
  lireSchemaEnregistre,
  type ConfigClient,
} from "@/lib/schema-production";
import { getOptionsConfigurateur } from "@/app/(app)/reglages/actions";
import type { OptionSM } from "@/app/(app)/leads/[id]/devis/[devisId]/sur-mesure";

// Devis de référence du chantier : le devis signé, sinon le plus récent retenu.
export async function devisReference(leadId: string) {
  const rows = await db
    .select()
    .from(devis)
    .where(eq(devis.leadId, leadId))
    .orderBy(desc(devis.createdAt));
  return rows.find((d) => d.accepteAt) ?? rows.find((d) => d.statut !== "Non retenu") ?? null;
}

// Dernière validation non annulée de la fiche.
export async function validationCourante(leadId: string) {
  const [v] = await db
    .select()
    .from(validationsChantier)
    .where(and(eq(validationsChantier.leadId, leadId), ne(validationsChantier.statut, "annulee")))
    .orderBy(desc(validationsChantier.demandeeAt))
    .limit(1);
  return v ?? null;
}

// Données du configurateur client : options proposées (actives + celles déjà
// utilisées), référence (devis signé + métré) et configuration de départ (la
// dernière envoyée par le client si l'équipe a rouvert, sinon la référence).
export async function donneesConfigurateur(leadId: string): Promise<{
  options: OptionSM[];
  reference: ConfigClient;
  initiale: ConfigClient;
} | null> {
  const [lead] = await db
    .select({ metre: leads.metre })
    .from(leads)
    .where(and(eq(leads.id, leadId), isNull(leads.deletedAt)))
    .limit(1);
  if (!lead) return null;
  const [ref, toutes, [derniere]] = await Promise.all([
    devisReference(leadId),
    getOptionsConfigurateur(true),
    db
      .select({ schema: validationsChantier.schema })
      .from(validationsChantier)
      .where(eq(validationsChantier.leadId, leadId))
      .orderBy(desc(validationsChantier.demandeeAt))
      .limit(1),
  ]);
  const reference = configDepuisDevis({ config: ref?.config ?? null, metre: lireMetre(lead.metre), options: toutes });
  const precedente = lireSchemaEnregistre(derniere?.schema)?.config ?? null;
  const utilisees = new Set(
    [reference, precedente]
      .filter((c): c is ConfigClient => !!c)
      .flatMap((c) => [...Object.values(c.fermetures), ...c.equipements.map((e) => e.optionId)])
      .filter((x): x is string => !!x),
  );
  const options = toutes.filter((o) => o.actif !== false || utilisees.has(o.id));
  const relue = precedente ? lireConfig(precedente, options) : null;
  return { options, reference, initiale: relue?.ok ? relue.config : reference };
}
