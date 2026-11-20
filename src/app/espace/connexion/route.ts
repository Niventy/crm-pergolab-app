import { NextResponse, after } from "next/server";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { leads, stages } from "@/db/schema";
import { lienActif } from "@/lib/espace-client";
import { DELAI_RENVOI_MS, envoyerLienAcces } from "@/lib/espace-client-email";
import { emailDisponible } from "@/lib/espace-client-config";

// Page de connexion de l'espace client : le client saisit son email ; s'il a un
// projet SIGNÉ (fiche client non supprimée), on lui envoie son lien d'accès par
// email. Réponse IDENTIQUE dans tous les cas (on ne révèle pas si l'adresse est
// cliente). Anti-rafale : un envoi par fiche toutes les 2 minutes.
export async function POST(req: Request) {
  const reponse = NextResponse.json({ ok: true });
  const origin = req.headers.get("origin");
  const ici = new URL(req.url);
  if (origin && new URL(origin).host !== req.headers.get("host"))
    return NextResponse.json({ ok: false }, { status: 403 });

  let email = "";
  try {
    const b = (await req.json()) as { email?: unknown };
    email = typeof b.email === "string" ? b.email.trim().toLowerCase().slice(0, 200) : "";
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ ok: false }, { status: 400 });

  // Recherche ET envoi APRÈS la réponse : même temps de réponse que l'adresse
  // soit cliente ou non.
  if (!emailDisponible()) return reponse; // envoi pas encore configuré : rien à faire
  after(async () => {
    const fiches = await db
      .select({ id: leads.id })
      .from(leads)
      .leftJoin(stages, eq(stages.id, leads.stageId))
      .where(
        and(
          sql`lower(trim(${leads.email})) = ${email}`,
          isNull(leads.deletedAt),
          or(eq(leads.statut, "gagnee"), eq(stages.cycle, 3)),
        ),
      )
      .orderBy(desc(leads.createdAt))
      .limit(3);

    for (const f of fiches) {
      const acces = await lienActif(f.id);
      if (acces?.dernierEnvoiAt && Date.now() - acces.dernierEnvoiAt.getTime() < DELAI_RENVOI_MS) continue;
      const r = await envoyerLienAcces({ leadId: f.id, origin: ici.origin });
      if (!r.ok) console.error("Espace client — envoi du lien impossible :", f.id, r.error);
    }
  });
  return reponse;
}
