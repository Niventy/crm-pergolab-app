import { timingSafeEqual } from "node:crypto";
import { and, desc, isNull, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { stageEntree } from "@/lib/pipeline-server";

export const dynamic = "force-dynamic";

// Récupère la 1ère valeur non vide parmi plusieurs clés possibles du payload.
function pick(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

// Meta envoie parfois les réponses sous forme [{ name, values: [...] }].
function flattenFieldData(obj: Record<string, unknown>): Record<string, unknown> {
  const fd = obj.field_data ?? obj.fields ?? obj.form_response;
  if (!Array.isArray(fd)) return obj;
  const flat: Record<string, unknown> = { ...obj };
  for (const f of fd as Array<Record<string, unknown>>) {
    const name = typeof f.name === "string" ? f.name : undefined;
    const values = f.values ?? f.value;
    if (name) flat[name] = Array.isArray(values) ? values[0] : values;
  }
  return flat;
}

// Parse une date de soumission (ISO Meta « 2026-06-07T10:15:22.000Z »).
function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Déduit la source lisible depuis la plateforme Meta.
function sourceFromPlatform(p: string | null): string | null {
  if (!p) return null;
  const v = p.toLowerCase();
  if (v.includes("insta") || v === "ig") return "Instagram Lead Ads";
  if (v.includes("face") || v === "fb") return "Facebook Lead Ads";
  return null;
}

export async function POST(req: Request) {
  // 1) Authentification par secret partagé.
  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  // Comparaison à temps constant (pas de fuite par le temps de réponse).
  const a = Buffer.from(token);
  const b = Buffer.from(secret ?? "");
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }

  // 2) Lecture du corps JSON.
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "JSON invalide" }, { status: 400 });
  }
  const data = flattenFieldData(body);

  // 3) Normalisation des champs.
  const prenom = pick(data, ["first_name", "prenom", "prénom"]);
  const nomFamille = pick(data, ["last_name", "nom_famille"]);
  const nomComplet = [prenom, nomFamille].filter(Boolean).join(" ").trim();
  const nom =
    pick(data, ["nom", "full_name", "name", "full name"]) ??
    (nomComplet || null) ??
    pick(data, ["email", "email_address"]) ??
    "Nouveau lead";

  const source =
    pick(data, ["source"]) ??
    sourceFromPlatform(pick(data, ["platform", "plateforme"])) ??
    "Meta Lead Ads";

  // Date de réception = date de soumission Meta si fournie, sinon « maintenant ».
  const recuLe = parseDate(
    pick(data, ["created_time", "created_at", "date_created", "sheet_date", "date_creation"]),
  );

  // 4) Étape d'entrée : « À traiter » (par clé stable, sinon 1ère du cycle 1).
  const stage = await stageEntree();

  const emailVal = pick(data, ["email", "email_address", "mail"]);
  const telVal = pick(data, ["telephone", "téléphone", "phone", "phone_number", "tel"]);

  // 4 bis) Même contact (email/téléphone) déjà présent ? Le téléphone est
  // comparé sur ses CHIFFRES (« 06 12 34 » = « 0612 34 » = « +33 6 12 34 »).
  let resoumission = false;
  const telDigits = telVal ? telVal.replace(/\D/g, "").replace(/^33/, "0") : null;
  const ident = [
    ...(emailVal ? [sql`lower(${leads.email}) = ${emailVal.toLowerCase()}`] : []),
    ...(telDigits && telDigits.length >= 9
      ? [
          sql`regexp_replace(regexp_replace(coalesce(${leads.telephone}, ''), '\\D', '', 'g'), '^33', '0') = ${telDigits}`,
        ]
      : []),
  ];
  if (ident.length > 0) {
    const [existing] = await db
      .select({ id: leads.id, createdAt: leads.createdAt })
      .from(leads)
      .where(and(isNull(leads.deletedAt), or(...ident)))
      .orderBy(desc(leads.createdAt))
      .limit(1);

    if (existing) {
      const sameSubmission =
        recuLe &&
        existing.createdAt &&
        new Date(existing.createdAt).getTime() === recuLe.getTime();

      if (sameSubmission) {
        // Doublon technique (même soumission postée 2×) → ignoré silencieusement.
        return Response.json(
          { ok: true, duplicate: true, id: existing.id },
          { status: 200 },
        );
      }
      // Re-soumission : même contact, autre moment → on crée le lead, flaggé.
      resoumission = true;
    }
  }

  // 5) Insertion (non assigné, statut en_cours, payload brut conservé).
  const [created] = await db
    .insert(leads)
    .values({
      stageId: stage?.id ?? null,
      statut: "en_cours",
      resoumission,
      ...(recuLe ? { createdAt: recuLe } : {}),
      nom,
      email: emailVal,
      telephone: telVal,
      source,
      campagne: pick(data, ["campagne", "campaign_name", "campaign", "ad_name", "adset_name"]),
      typeProjet: pick(data, ["typeProjet", "type_projet", "type de projet", "type_de_projet", "projet"]),
      dimensions: pick(data, ["dimensions", "dimension", "taille"]),
      gamme: pick(data, ["gamme"]),
      codePostal: pick(data, ["codePostal", "code_postal", "code postal", "zip", "postal_code", "cp"]),
      dateSouhaiteeAppel: pick(data, [
        "dateSouhaiteeAppel",
        "date_souhaitee_appel",
        "creneau",
        "créneau",
        "horaire",
        "disponibilite",
      ]),
      dateInstallation: pick(data, ["dateInstallation", "date_installation", "installation", "delai", "délai"]),
      rawPayload: body,
    })
    .returning({ id: leads.id });

  // 6) Rafraîchit les vues.
  revalidatePath("/kanban");
  revalidatePath("/liste");
  revalidatePath("/dashboard");

  return Response.json({ ok: true, id: created?.id, nom }, { status: 201 });
}
