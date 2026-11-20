import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { factures } from "@/db/schema";
import { factureVisibleClient, resoudreJeton } from "@/lib/espace-client";
import { getFacturePdfUrl } from "@/lib/pennylane";

// PDF d'une facture VALIDÉE (jamais un brouillon) de CETTE fiche, depuis
// l'espace client. Redirige vers l'URL Pennylane fraîche.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jeton: string; factureId: string }> },
) {
  const { jeton, factureId } = await params;
  const leadId = await resoudreJeton(jeton);
  const introuvable = () => new NextResponse("Facture introuvable.", { status: 404 });
  if (!leadId || !/^[0-9a-f-]{36}$/i.test(factureId)) return introuvable();

  const [f] = await db
    .select()
    .from(factures)
    .where(and(eq(factures.id, factureId), eq(factures.leadId, leadId)))
    .limit(1);
  if (!f?.externalId || !factureVisibleClient(f)) return introuvable();

  const r = await getFacturePdfUrl(f.externalId);
  if (!r.ok || !r.url)
    return new NextResponse("Le PDF n'est pas disponible pour le moment, réessayez plus tard.", {
      status: 503,
    });
  const res = NextResponse.redirect(r.url, 302);
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("Cache-Control", "no-store");
  return res;
}
