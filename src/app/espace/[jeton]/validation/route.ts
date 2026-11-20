import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { documents, echanges, leads, validationsChantier } from "@/db/schema";
import { resoudreJeton } from "@/lib/espace-client";
import { notifier } from "@/lib/notifications";
import type { PointValidation, Reponses } from "@/lib/chantier-validation";
import { lireDetails, lireSchema, resumeDetails, type DetailsClient } from "@/lib/schema-production";

// Réponse du client au chat de validation (route et non server action : les
// server actions sont refusées sans session, cf. middleware).
// Corps : { validationId, reponses: { [cle]: { ok, commentaire } }, details, accord }.
// `details` (précisions de pose : côté maison, lames, sol, photos) est exigé
// quand la demande porte un schéma de production.
// Tout OK + accord coché → « validee » ; au moins un point à corriger → « a_corriger ».
export async function POST(
  req: Request,
  { params }: { params: Promise<{ jeton: string }> },
) {
  const { jeton } = await params;
  const erreur = (message: string, status = 400) =>
    NextResponse.json({ ok: false, error: message }, { status });

  // Même origine uniquement (le jeton suffit déjà, ceinture + bretelles).
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host"))
    return erreur("Origine refusée.", 403);

  const leadId = await resoudreJeton(jeton);
  if (!leadId) return erreur("Lien invalide ou expiré.", 404);

  let body: { validationId?: unknown; reponses?: unknown; details?: unknown; accord?: unknown };
  try {
    body = await req.json();
  } catch {
    return erreur("Requête invalide.");
  }
  if (typeof body.validationId !== "string") return erreur("Requête invalide.");

  const [v] = await db
    .select()
    .from(validationsChantier)
    .where(and(eq(validationsChantier.id, body.validationId), eq(validationsChantier.leadId, leadId)))
    .limit(1);
  if (!v || v.statut !== "demandee")
    return erreur("Cette demande n'est plus d'actualité : rechargez la page.", 409);

  // Une réponse par point présenté ; commentaire obligatoire si « à corriger ».
  const points = v.points as PointValidation[];
  const brut = (body.reponses ?? {}) as Record<string, { ok?: unknown; commentaire?: unknown }>;
  const reponses: Reponses = {};
  for (const p of points) {
    const r = brut[p.cle];
    if (!r || typeof r.ok !== "boolean") return erreur("Répondez à chaque point avant d'envoyer.");
    const commentaire =
      typeof r.commentaire === "string" && r.commentaire.trim() ? r.commentaire.trim().slice(0, 2000) : null;
    if (!r.ok && !commentaire) return erreur(`Précisez la correction pour « ${p.titre} ».`);
    reponses[p.cle] = { ok: r.ok, commentaire };
  }
  // Précisions de pose (schéma de production) ; photos = documents de CETTE fiche.
  let details: DetailsClient | null = null;
  if (v.schema) {
    const d = lireDetails(body.details, lireSchema(v.schema));
    if (!d.ok) return erreur(d.error);
    details = d.details;
    if (details.photos.length) {
      const miennes = await db
        .select({ id: documents.id })
        .from(documents)
        .where(and(eq(documents.leadId, leadId), inArray(documents.id, details.photos)));
      details.photos = miennes.map((m) => m.id);
    }
  }

  const toutOk = points.every((p) => reponses[p.cle].ok);
  if (toutOk && body.accord !== true) return erreur("Cochez la case de confirmation pour valider.");

  const statut = toutOk ? "validee" : "a_corriger";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip");
  const maj = await db
    .update(validationsChantier)
    .set({
      statut,
      reponses,
      details,
      reponduAt: new Date(),
      ip: ip ?? null,
      userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
    })
    .where(and(eq(validationsChantier.id, v.id), eq(validationsChantier.statut, "demandee")))
    .returning({ id: validationsChantier.id });
  if (!maj.length) return erreur("Cette demande n'est plus d'actualité : rechargez la page.", 409);

  const aCorriger = points.filter((p) => !reponses[p.cle].ok).map((p) => p.documentNom ?? p.titre);
  const precisions = details ? resumeDetails(details) : [];
  await db.insert(echanges).values({
    leadId,
    userId: null,
    type: "espace_client",
    contenu:
      (toutOk
        ? "Le client a VALIDÉ son schéma de production"
        : `Le client demande des corrections : ${aCorriger.join(", ")}`) +
      (precisions.length ? `
${precisions.join(" · ")}` : ""),
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
      message: toutOk
        ? `${lead.nom} a validé son schéma de production`
        : `${lead.nom} demande des corrections sur son schéma de production`,
    });

  return NextResponse.json({ ok: true, statut });
}
