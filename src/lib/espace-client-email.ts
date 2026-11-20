import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { accesClient, echanges, leads, profiles } from "@/db/schema";
import { DUREE_LIEN_JOURS, lienActif, nouveauJeton } from "@/lib/espace-client";
import { resolveSender } from "@/lib/email-sender";
import { escapeHtml, envoyerGmail } from "@/lib/gmail";

// Email « Accéder à votre projet » : lien magique de l'espace client. Envoyé
// depuis la fiche (boîte de l'ADV connecté) ou depuis la page de connexion
// /espace (boîte du responsable de la fiche, sinon 1ʳᵉ boîte configurée).
// Crée le lien d'accès s'il n'existe pas. Journalisé dans le fil.

// Délai minimal entre deux envois pour une même fiche (page de connexion).
export const DELAI_RENVOI_MS = 2 * 60_000;

function htmlEmail(prenom: string, url: string, conseiller: string | null) {
  const p = escapeHtml(prenom);
  const u = escapeHtml(url);
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">
  <p style="font-size:16px">Bonjour ${p},</p>
  <p style="font-size:15px;line-height:1.5">Votre espace client Pergolab vous permet de suivre l'avancement de votre projet, de retrouver vos devis, factures et documents, et d'échanger avec nous.</p>
  <p style="text-align:center;margin:28px 0">
    <a href="${u}" style="background:#1e3a2f;color:#ffffff;text-decoration:none;font-weight:bold;padding:14px 26px;border-radius:8px;display:inline-block;font-size:15px">Accéder à mon projet</a>
  </p>
  <p style="font-size:13px;color:#6b7280;line-height:1.5">Ce lien est personnel, merci de ne pas le transférer. Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :<br><a href="${u}" style="color:#1e3a2f;word-break:break-all">${u}</a></p>
  <p style="font-size:15px">À très vite,<br>${conseiller ? `${escapeHtml(conseiller)} — ` : ""}L'équipe Pergolab</p>
</div>`;
}

export async function envoyerLienAcces(opts: {
  leadId: string;
  origin: string; // https://crm.… (sans / final)
  depuisFiche?: { userId: string; userEmail: string | null };
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const [lead] = await db
    .select({ id: leads.id, nom: leads.nom, email: leads.email, assignedTo: leads.assignedTo })
    .from(leads)
    .where(and(eq(leads.id, opts.leadId), isNull(leads.deletedAt)))
    .limit(1);
  if (!lead) return { ok: false, error: "Fiche introuvable." };
  if (!lead.email?.includes("@")) return { ok: false, error: "Pas d'email sur la fiche." };

  const responsable = lead.assignedTo
    ? (
        await db
          .select({ nom: profiles.nom, email: profiles.email })
          .from(profiles)
          .where(eq(profiles.id, lead.assignedTo))
          .limit(1)
      )[0]
    : undefined;

  // Expéditeur : l'ADV connecté (fiche) ; sinon le responsable, sinon le 1ᵉʳ compte.
  const account = opts.depuisFiche
    ? resolveSender(opts.depuisFiche.userEmail)
    : (responsable?.email ? resolveSender(responsable.email) : null) ?? resolveSender(null);
  if (!account) return { ok: false, error: "Aucun expéditeur Gmail configuré pour ton compte." };

  let acces = await lienActif(lead.id);
  if (!acces) {
    [acces] = await db
      .insert(accesClient)
      .values({
        leadId: lead.id,
        jeton: nouveauJeton(),
        createdBy: opts.depuisFiche?.userId ?? null,
        expiresAt: new Date(Date.now() + DUREE_LIEN_JOURS * 86_400_000),
      })
      .returning();
  }

  const prenom = lead.nom.trim().replace(/\s+/g, " ");
  const r = await envoyerGmail({
    account,
    to: lead.email,
    subject: "Votre espace client Pergolab — accédez à votre projet",
    html: htmlEmail(prenom, `${opts.origin}/espace/${acces.jeton}`, responsable?.nom ?? null),
    replyTo: opts.depuisFiche?.userEmail ?? responsable?.email ?? undefined,
  });
  if (!r.ok) return r;

  await db.update(accesClient).set({ dernierEnvoiAt: new Date() }).where(eq(accesClient.id, acces.id));
  await db.insert(echanges).values({
    leadId: lead.id,
    userId: opts.depuisFiche?.userId ?? null,
    type: "espace_client",
    contenu: opts.depuisFiche
      ? `Lien de l'espace client envoyé par email à ${lead.email}`
      : `Le client a demandé son lien d'accès (envoyé à ${lead.email})`,
  });
  return { ok: true };
}
