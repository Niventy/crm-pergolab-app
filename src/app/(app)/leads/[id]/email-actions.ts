"use server";

import { OAuth2Client } from "google-auth-library";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { echanges } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { currentUserId } from "@/lib/current-user";
import { resolveSender } from "@/lib/email-sender";

export type EmailState = { ok: boolean; error: string | null };

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Encodage MIME « encoded-word » pour un en-tête (objet) avec accents.
function encodeHeader(s: string): string {
  return `=?UTF-8?B?${Buffer.from(s, "utf-8").toString("base64")}?=`;
}

// Message RFC 5322 encodé en base64url pour l'API Gmail.
function buildRawMessage(
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

// Envoie un email via l'API Gmail en OAuth. From = expéditeur résolu selon
// l'ADV connecté ; Reply-To = l'ADV connecté. Journalise un `echange` type=email.
export async function sendLeadEmail(
  leadId: string,
  data: { to: string; subject: string; body: string },
): Promise<EmailState> {
  const to = data.to.trim();
  const subject = data.subject.trim();
  const body = data.body.trim();
  if (!to || !subject || !body)
    return { ok: false, error: "Destinataire, objet et message sont requis." };

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    return { ok: false, error: "Envoi Gmail non configuré (OAuth manquant)." };

  // Reply-to = adresse de l'ADV connecté ; sert aussi à choisir l'expéditeur.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const replyTo = user?.email ?? undefined;

  const account = resolveSender(user?.email);
  if (!account)
    return { ok: false, error: "Aucun expéditeur Gmail configuré." };
  const sender = account.from;
  const refreshToken = account.refreshToken;

  const html = body
    .split("\n")
    .map((l) => (l.trim() ? `<p>${escapeHtml(l)}</p>` : "<br/>"))
    .join("");
  const raw = buildRawMessage(sender, to, subject, html, replyTo);

  try {
    const client = new OAuth2Client(clientId, clientSecret);
    client.setCredentials({ refresh_token: refreshToken });
    const at = await client.getAccessToken();
    const token = typeof at === "string" ? at : at?.token;
    if (!token)
      return { ok: false, error: "Auth Gmail échouée (refresh token invalide ?)." };

    const res = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
      },
    );
    if (!res.ok) {
      const detail = await res.text();
      console.error("Gmail send error:", res.status, detail);
      return { ok: false, error: `Gmail ${res.status} — ${detail.slice(0, 300)}` };
    }
  } catch (e) {
    console.error("Gmail send exception:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Échec envoi : ${msg.slice(0, 300)}` };
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

// ---------------------------------------------------------------------------
// Lecture du fil Gmail avec un lead (envois + réponses) — scope gmail.readonly
// ---------------------------------------------------------------------------
export type ThreadMessage = {
  id: string;
  direction: "in" | "out";
  from: string;
  subject: string;
  date: number; // internalDate (ms)
  body: string;
};

type GPart = { mimeType?: string; body?: { data?: string }; parts?: GPart[] };
type GMessage = {
  internalDate?: string;
  payload?: GPart & { headers?: { name: string; value: string }[] };
};

function b64urlDecode(data: string): string {
  return Buffer.from(
    data.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  ).toString("utf-8");
}
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
function extractBody(part?: GPart): string {
  if (!part) return "";
  if (part.body?.data && !part.parts) {
    const txt = b64urlDecode(part.body.data);
    return part.mimeType === "text/html" ? stripHtml(txt) : txt;
  }
  const parts = part.parts ?? [];
  for (const p of parts)
    if (p.mimeType === "text/plain" && p.body?.data) return b64urlDecode(p.body.data);
  for (const p of parts)
    if (p.mimeType === "text/html" && p.body?.data)
      return stripHtml(b64urlDecode(p.body.data));
  for (const p of parts) {
    const n = extractBody(p);
    if (n) return n;
  }
  return "";
}

export async function fetchLeadEmails(
  leadEmail: string,
): Promise<{ ok: boolean; messages?: ThreadMessage[]; error?: string }> {
  const email = leadEmail?.trim();
  if (!email) return { ok: true, messages: [] };

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    return { ok: false, error: "Email non configuré." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const account = resolveSender(user?.email);
  if (!account) return { ok: false, error: "Aucun compte Gmail configuré." };

  try {
    const client = new OAuth2Client(clientId, clientSecret);
    client.setCredentials({ refresh_token: account.refreshToken });
    const at = await client.getAccessToken();
    const token = typeof at === "string" ? at : at?.token;
    if (!token) return { ok: false, error: "Auth Gmail échouée." };

    const q = encodeURIComponent(`from:${email} OR to:${email}`);
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=10`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!listRes.ok) {
      if (listRes.status === 403)
        return {
          ok: false,
          error:
            "Lecture Gmail non autorisée — régénère les tokens avec le scope gmail.readonly.",
        };
      return { ok: false, error: `Gmail ${listRes.status}` };
    }
    const list = (await listRes.json()) as { messages?: { id: string }[] };
    const ids = (list.messages ?? []).map((m) => m.id);

    const out: ThreadMessage[] = [];
    for (const id of ids) {
      const mRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!mRes.ok) continue;
      const msg = (await mRes.json()) as GMessage;
      const headers = msg.payload?.headers ?? [];
      const h = (n: string) =>
        headers.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? "";
      const from = h("From");
      out.push({
        id,
        direction: from.toLowerCase().includes(email.toLowerCase()) ? "in" : "out",
        from,
        subject: h("Subject"),
        date: Number(msg.internalDate ?? 0),
        body: extractBody(msg.payload).slice(0, 4000),
      });
    }
    out.sort((a, b) => a.date - b.date);
    return { ok: true, messages: out };
  } catch (e) {
    console.error("Gmail read error:", e);
    return { ok: false, error: "Échec de la lecture Gmail." };
  }
}
