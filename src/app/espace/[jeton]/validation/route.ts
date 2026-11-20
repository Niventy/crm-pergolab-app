import { NextResponse } from "next/server";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { documents, echanges, leads, validationsChantier } from "@/db/schema";
import { resoudreJeton } from "@/lib/espace-client";
import { notifier } from "@/lib/notifications";
import { donneesConfigurateur, validationCourante } from "@/lib/chantier-validation-server";
import {
  ecartsConfig,
  lireConfig,
  lireDetails,
  resumeConfig,
  resumeDetails,
  type SchemaEnregistre,
} from "@/lib/schema-production";

// Le client envoie SA configuration (configurateur de l'espace client) : elle
// devient le schéma de production validé (statut « validee »), avec les écarts
// par rapport au devis signé + métré, signalés à l'équipe. Route et non server
// action : les server actions sont refusées sans session (middleware).
// Corps : { config, details, accord: true }.
export async function POST(req: Request, { params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const erreur = (message: string, status = 400) => NextResponse.json({ ok: false, error: message }, { status });

  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return erreur("Origine refusée.", 403);
  const leadId = await resoudreJeton(jeton);
  if (!leadId) return erreur("Lien invalide ou expiré.", 404);

  let body: { config?: unknown; details?: unknown; accord?: unknown };
  try {
    body = await req.json();
  } catch {
    return erreur("Requête invalide.");
  }

  const courante = await validationCourante(leadId);
  if (courante?.statut === "validee") return erreur("Votre schéma est déjà validé : rechargez la page.", 409);
  const donnees = await donneesConfigurateur(leadId);
  if (!donnees) return erreur("Projet introuvable.", 404);

  const c = lireConfig(body.config, donnees.options);
  if (!c.ok) return erreur(c.error);
  const d = lireDetails(body.details, c.config);
  if (!d.ok) return erreur(d.error);
  if (body.accord !== true) return erreur("Cochez la case de confirmation pour valider.");
  const details = d.details;
  if (details.photos.length)
    details.photos = (
      await db
        .select({ id: documents.id })
        .from(documents)
        .where(and(eq(documents.leadId, leadId), inArray(documents.id, details.photos)))
    ).map((x) => x.id);

  const schema: SchemaEnregistre = {
    config: c.config,
    reference: donnees.reference,
    ecarts: ecartsConfig(c.config, donnees.reference, donnees.options),
    resume: resumeConfig(c.config, donnees.options),
  };
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip");
  const reponse = {
    statut: "validee",
    schema,
    details,
    reponduAt: new Date(),
    ip: ip ?? null,
    userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
  };
  if (courante) {
    const maj = await db
      .update(validationsChantier)
      .set(reponse)
      .where(and(eq(validationsChantier.id, courante.id), ne(validationsChantier.statut, "validee")))
      .returning({ id: validationsChantier.id });
    if (!maj.length) return erreur("Votre schéma est déjà validé : rechargez la page.", 409);
  } else {
    await db.insert(validationsChantier).values({ leadId, points: [], ...reponse });
  }

  await db.insert(echanges).values({
    leadId,
    userId: null,
    type: "espace_client",
    contenu: [
      "Le client a configuré et validé son schéma de production",
      ...schema.resume,
      ...resumeDetails(details),
      schema.ecarts.length ? `⚠ ÉCARTS avec le devis / métré : ${schema.ecarts.join(" · ")}` : "Conforme au devis signé",
    ].join("\n"),
  });
  const [lead] = await db
    .select({ nom: leads.nom, assignedTo: leads.assignedTo, poseAssignedTo: leads.poseAssignedTo })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
  if (lead)
    await notifier({
      userIds: [lead.assignedTo, lead.poseAssignedTo],
      type: "validation_client",
      leadId,
      message: schema.ecarts.length
        ? `${lead.nom} a validé son schéma — ${schema.ecarts.length} écart${schema.ecarts.length > 1 ? "s" : ""} avec le devis`
        : `${lead.nom} a validé son schéma de production (conforme au devis)`,
    });

  return NextResponse.json({ ok: true });
}
