"use server";

import { JWT } from "google-auth-library";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { echanges } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { currentUserId } from "@/lib/current-user";

export type EmailState = { ok: boolean; error: string | null };

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Encodage MIME « encoded-word » pour un en-tête (objet) contenant des accents.
function encodeHeader(s: string): string {
  return `=?UTF-8?B?${Buffer.from(s, "utf-8").toString("base64")}?=`;
}

// Construit un message RFC 5322 encodé en base64url pour l'API Gmail.
function buildRawMessage(from: string, to: string, subject: string, html: string) {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(html, "utf-8").toString("base64"),
  ];
  return Buffer.from(lines.join("\r\n"), "utf-8").toString("base64url");
}

// Envoie un email AU NOM de l'ADV connecté via l'API Gmail (délégation à
// l'échelle du domaine Google Workspace). Le mail apparaît dans ses « Envoyés »
// et les réponses se threadent dans Gmail. L'envoi est journalisé (type "email").
export async function sendLeadEmail(
  leadId: string,
  data: { to: string; subject: string; body: string },
): Promise<EmailState> {
  const to = data.to.trim();
  const subject = data.subject.trim();
  const body = data.body.trim();
  if (!to || !subject || !body)
    return { ok: false, error: "Destinataire, objet et message sont requis." };

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey)
    return { ok: false, error: "Envoi Gmail non configuré (compte de service manquant)." };

  // L'ADV connecté = expéditeur impersonifié. Doit être un compte du domaine Workspace.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const from = user?.email;
  if (!from)
    return { ok: false, error: "Impossible de déterminer votre adresse d'envoi." };

  const html = body
    .split("\n")
    .map((l) => (l.trim() ? `<p>${escapeHtml(l)}</p>` : "<br/>"))
    .join("");
  const raw = buildRawMessage(from, to, subject, html);

  try {
    const auth = new JWT({
      email: clientEmail,
      key: privateKey,
      scopes: [GMAIL_SCOPE],
      subject: from, // impersonation de l'ADV
    });
    const { access_token } = await auth.authorize();
    if (!access_token) return { ok: false, error: "Authentification Gmail échouée." };

    const res = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
      },
    );
    if (!res.ok) {
      const detail = await res.text();
      console.error("Gmail send error:", res.status, detail);
      return {
        ok: false,
        error:
          res.status === 403
            ? "Accès refusé : vérifie la délégation du domaine et que ton compte est bien sur le Workspace."
            : "Échec de l'envoi de l'email.",
      };
    }
  } catch (e) {
    console.error("Gmail send exception:", e);
    return { ok: false, error: "Échec de l'envoi de l'email." };
  }

  await db.insert(echanges).values({
    leadId,
    userId: await currentUserId(),
    type: "email",
    contenu: subject,
  });
  revalidatePath(`/leads/${leadId}`);

  return { ok: true, error: null };
}
