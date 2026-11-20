import { NextResponse } from "next/server";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { echanges, leads } from "@/db/schema";
import { resoudreJeton } from "@/lib/espace-client";
import { notifier } from "@/lib/notifications";

// Message libre du client depuis son espace → fil d'activité de la fiche
// (type « commentaire_client ») + notification au responsable et au métreur.
// Limite : 2 000 caractères, 10 messages par 24 h et par fiche.
export async function POST(req: Request, { params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const erreur = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return erreur("Origine refusée.", 403);

  const leadId = await resoudreJeton(jeton);
  if (!leadId) return erreur("Lien invalide ou expiré.", 404);

  let message = "";
  try {
    const b = (await req.json()) as { message?: unknown };
    message = typeof b.message === "string" ? b.message.trim() : "";
  } catch {
    return erreur("Requête invalide.");
  }
  if (!message) return erreur("Écrivez votre message.");
  if (message.length > 2000) return erreur("Message trop long (2 000 caractères maximum).");

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(echanges)
    .where(
      and(
        eq(echanges.leadId, leadId),
        eq(echanges.type, "commentaire_client"),
        gt(echanges.date, new Date(Date.now() - 86_400_000)),
      ),
    );
  if (n >= 10) return erreur("Vous avez envoyé beaucoup de messages aujourd'hui : appelez-nous directement.", 429);

  await db.insert(echanges).values({ leadId, userId: null, type: "commentaire_client", contenu: message });
  const [lead] = await db
    .select({ nom: leads.nom, assignedTo: leads.assignedTo, poseAssignedTo: leads.poseAssignedTo })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
  if (lead)
    await notifier({
      userIds: [lead.assignedTo, lead.poseAssignedTo],
      type: "commentaire_client",
      leadId,
      message: `${lead.nom} a laissé un message : « ${message.slice(0, 80)}${message.length > 80 ? "…" : ""} »`,
    });
  return NextResponse.json({ ok: true });
}
