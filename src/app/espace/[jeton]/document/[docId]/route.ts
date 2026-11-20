import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { resoudreJeton } from "@/lib/espace-client";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Document PARTAGÉ (« client » ou « à valider ») depuis l'espace client : jeton
// valide + document de CETTE fiche. Lien signé Supabase de 10 min.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jeton: string; docId: string }> },
) {
  const { jeton, docId } = await params;
  const leadId = await resoudreJeton(jeton);
  const introuvable = () => new NextResponse("Document introuvable.", { status: 404 });
  if (!leadId || !/^[0-9a-f-]{36}$/i.test(docId)) return introuvable();

  const [d] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.id, docId),
        eq(documents.leadId, leadId),
        inArray(documents.partage, ["client", "a_valider"]),
      ),
    )
    .limit(1);
  if (!d) return introuvable();

  const sb = supabaseAdmin();
  const signe = sb ? await sb.storage.from("documents").createSignedUrl(d.chemin, 600) : null;
  if (!signe?.data?.signedUrl)
    return new NextResponse("Le document n'est pas disponible pour le moment, réessayez plus tard.", {
      status: 503,
    });
  const res = NextResponse.redirect(signe.data.signedUrl, 302);
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("Cache-Control", "no-store");
  return res;
}
