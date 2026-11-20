import { OAuth2Client } from "google-auth-library";
import type { SenderAccount } from "@/lib/email-sender";

// Envoi Gmail (API REST, OAuth refresh token) — partagé par la fiche (emails,
// devis) et l'espace client (lien d'accès). SERVEUR UNIQUEMENT.

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Encodage MIME « encoded-word » pour un en-tête (objet) avec accents.
export function encodeHeader(s: string): string {
  return `=?UTF-8?B?${Buffer.from(s, "utf-8").toString("base64")}?=`;
}

// Message RFC 5322 HTML encodé en base64url pour l'API Gmail.
export function buildRawMessage(
  from: string,
  to: string,
  subject: string,
  html: string,
  replyTo?: string,
) {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(html, "utf-8").toString("base64"),
  ];
  return Buffer.from(lines.join("\r\n"), "utf-8").toString("base64url");
}

// Envoie un email HTML depuis la boîte `account`.
export async function envoyerGmail(opts: {
  account: SenderAccount;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { ok: false, error: "Envoi Gmail non configuré (OAuth manquant)." };
  try {
    const client = new OAuth2Client(clientId, clientSecret);
    client.setCredentials({ refresh_token: opts.account.refreshToken });
    const at = await client.getAccessToken();
    const token = typeof at === "string" ? at : at?.token;
    if (!token) return { ok: false, error: "Auth Gmail échouée (refresh token invalide ?)." };
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        raw: buildRawMessage(opts.account.from, opts.to, opts.subject, opts.html, opts.replyTo),
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error("Gmail send error:", res.status, detail);
      return { ok: false, error: `Gmail ${res.status} — ${detail.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("Gmail send exception:", e);
    return { ok: false, error: `Échec envoi : ${(e instanceof Error ? e.message : String(e)).slice(0, 300)}` };
  }
}
