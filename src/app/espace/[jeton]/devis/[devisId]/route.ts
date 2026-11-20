import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { devis } from "@/db/schema";
import { devisVisibleClient, resoudreJeton } from "@/lib/espace-client";
import { getQuotePdfUrl } from "@/lib/pennylane";

// PDF d'un devis depuis l'espace client : jeton valide + devis de CETTE fiche +
// devis visible (signé ou envoyé). Redirige vers l'URL Pennylane fraîche (~30 min).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jeton: string; devisId: string }> },
) {
  const { jeton, devisId } = await params;
  const leadId = await resoudreJeton(jeton);
  const introuvable = () => new NextResponse("Document introuvable.", { status: 404 });
  if (!leadId || !/^[0-9a-f-]{36}$/i.test(devisId)) return introuvable();

  const [d] = await db
    .select()
    .from(devis)
    .where(and(eq(devis.id, devisId), eq(devis.leadId, leadId)))
    .limit(1);
  if (!d?.externalId || !devisVisibleClient(d)) return introuvable();

  const r = await getQuotePdfUrl(d.externalId);
  if (!r.ok || !r.url)
    return new NextResponse("Le PDF n'est pas disponible pour le moment, réessayez plus tard.", {
      status: 503,
    });
  const res = NextResponse.redirect(r.url, 302);
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("Cache-Control", "no-store");
  return res;
}
