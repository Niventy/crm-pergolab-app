import { NextResponse } from "next/server";
import { and, count, eq, isNull, like } from "drizzle-orm";
import { db } from "@/db";
import { documents, validationsChantier } from "@/db/schema";
import { resoudreJeton } from "@/lib/espace-client";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Photo de l'emplacement déposée par le client pendant la validation de son
// schéma de production (réduite dans le navigateur avant l'envoi : Vercel
// limite le corps d'une requête à 4,5 Mo). Image ≤ 4 Mo, 20 photos max par fiche, uniquement
// tant qu'une demande est en cours. Enregistrée en document INTERNE de la fiche
// (« Photo client — … »), visible par l'équipe. Nécessite la clé service_role.
const MAX = 4 * 1024 * 1024;
const MAX_PHOTOS = 20;
const PREFIXE = "Photo client — ";

export async function POST(req: Request, { params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const erreur = (message: string, status = 400) =>
    NextResponse.json({ ok: false, error: message }, { status });

  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return erreur("Origine refusée.", 403);
  const leadId = await resoudreJeton(jeton);
  if (!leadId) return erreur("Lien invalide ou expiré.", 404);

  const sb = supabaseAdmin();
  if (!sb) return erreur("L'envoi de photos n'est pas encore disponible.", 503);

  const [enCours] = await db
    .select({ id: validationsChantier.id })
    .from(validationsChantier)
    .where(and(eq(validationsChantier.leadId, leadId), eq(validationsChantier.statut, "demandee")))
    .limit(1);
  if (!enCours) return erreur("Aucune validation en cours : rechargez la page.", 409);

  const [{ n }] = await db
    .select({ n: count() })
    .from(documents)
    .where(and(eq(documents.leadId, leadId), isNull(documents.userId), like(documents.nom, `${PREFIXE}%`)));
  if (n >= MAX_PHOTOS) return erreur(`${MAX_PHOTOS} photos maximum.`, 429);

  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get("file");
  } catch {
    return erreur("Requête invalide.");
  }
  if (!(file instanceof File) || file.size === 0) return erreur("Photo vide.");
  if (file.size > MAX) return erreur("Photo trop lourde (4 Mo maximum).");
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)) return erreur("Format accepté : JPG, PNG, WEBP ou HEIC.");

  const safe = file.name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-80);
  const chemin = `${leadId}/client-${crypto.randomUUID()}-${safe}`;
  const { error } = await sb.storage.from("documents").upload(chemin, file, { contentType: file.type, upsert: false });
  if (error) return erreur("L'envoi a échoué, réessayez.", 502);

  const [doc] = await db
    .insert(documents)
    .values({ leadId, nom: `${PREFIXE}${file.name.slice(0, 120)}`, chemin, mime: file.type, taille: file.size, partage: "interne" })
    .returning({ id: documents.id });
  return NextResponse.json({ ok: true, id: doc.id });
}
