"use server";

import { OAuth2Client } from "google-auth-library";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { echanges } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { currentUserId } from "@/lib/current-user";
import { resolveSender, allSenders } from "@/lib/email-sender";
import { getQuotePdfUrl } from "@/lib/pennylane";
import { marquerDevisEnvoye } from "@/lib/pipeline-server";

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
  account: string; // boîte d'où vient le message
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

// Cache court (par processus) du fil Gmail d'un contact : la fiche s'ouvre
// souvent plusieurs fois de suite et chaque ouverture interrogeait TOUTES les
// boîtes séquentiellement (N × 10 messages en format=full). « Actualiser »
// force la relecture.
type CacheEntry = { at: number; res: { ok: boolean; messages?: ThreadMessage[]; error?: string } };
const gmailCache = new Map<string, CacheEntry>();
const GMAIL_CACHE_MS = 2 * 60 * 1000;

export async function fetchLeadEmails(
  leadEmail: string,
  force = false,
): Promise<{ ok: boolean; messages?: ThreadMessage[]; error?: string }> {
  const email = leadEmail?.trim().toLowerCase();
  if (!email) return { ok: true, messages: [] };

  const cached = gmailCache.get(email);
  if (!force && cached && Date.now() - cached.at < GMAIL_CACHE_MS) return cached.res;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    return { ok: false, error: "Email non configuré." };

  const accounts = allSenders();
  if (accounts.length === 0)
    return { ok: false, error: "Aucun compte Gmail configuré." };

  const q = encodeURIComponent(`from:${email} OR to:${email}`);
  let anyOk = false;
  let scopeError = false;

  // Toutes les boîtes configurées, interrogées EN PARALLÈLE.
  const parBoite = await Promise.all(
    accounts.map(async (acc): Promise<ThreadMessage[]> => {
      try {
        const client = new OAuth2Client(clientId, clientSecret);
        client.setCredentials({ refresh_token: acc.refreshToken });
        const at = await client.getAccessToken();
        const token = typeof at === "string" ? at : at?.token;
        if (!token) return [];

        const listRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=10`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!listRes.ok) {
          if (listRes.status === 403) scopeError = true;
          return [];
        }
        anyOk = true;
        const list = (await listRes.json()) as { messages?: { id: string }[] };

        const msgs = await Promise.all(
          (list.messages ?? []).map(async ({ id }) => {
            const mRes = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
              { headers: { Authorization: `Bearer ${token}` } },
            );
            if (!mRes.ok) return null;
            const msg = (await mRes.json()) as GMessage;
            const headers = msg.payload?.headers ?? [];
            const h = (n: string) =>
              headers.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? "";
            const from = h("From");
            return {
              id,
              key: h("Message-ID") || id,
              account: acc.label,
              direction: from.toLowerCase().includes(email) ? "in" : "out",
              from,
              subject: h("Subject"),
              date: Number(msg.internalDate ?? 0),
              body: extractBody(msg.payload).slice(0, 4000),
            } as ThreadMessage & { key: string };
          }),
        );
        return msgs.filter((m): m is ThreadMessage & { key: string } => !!m);
      } catch (e) {
        console.error("Gmail read error:", acc.label, e);
        return [];
      }
    }),
  );

  // Dédoublonnage inter-boîtes (Message-ID) + tri chronologique.
  const seen = new Set<string>();
  const out: ThreadMessage[] = [];
  for (const m of parBoite.flat() as (ThreadMessage & { key?: string })[]) {
    const key = m.key ?? m.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const { key: _k, ...msg } = m;
    void _k;
    out.push(msg);
  }

  let res: { ok: boolean; messages?: ThreadMessage[]; error?: string };
  if (!anyOk && scopeError)
    res = {
      ok: false,
      error:
        "Lecture Gmail non autorisée — régénère les tokens avec le scope gmail.readonly.",
    };
  else {
    out.sort((a, b) => a.date - b.date);
    res = { ok: true, messages: out };
  }
  if (res.ok) gmailCache.set(email, { at: Date.now(), res });
  return res;
}

// Message MIME multipart avec le PDF du devis en pièce jointe (API Gmail).
function buildRawWithPdf(
  from: string,
  to: string,
  subject: string,
  html: string,
  pdfBase64: string,
  filename: string,
  replyTo?: string,
) {
  const boundary = `=_pl_${Date.now().toString(36)}`;
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(html, "utf-8").toString("base64"),
    "",
    `--${boundary}`,
    `Content-Type: application/pdf; name="${filename}"`,
    `Content-Disposition: attachment; filename="${filename}"`,
    "Content-Transfer-Encoding: base64",
    "",
    pdfBase64,
    "",
    `--${boundary}--`,
    "",
  ];
  return Buffer.from(lines.join("\r\n"), "utf-8").toString("base64url");
}

// Envoie le DEVIS (PDF Pennylane en pièce jointe) par email via Gmail, depuis
// l'adresse Pergolab de l'ADV connecté (Reply-To = ADV). Pas de lien Pennylane.
export async function sendDevisParGmail(
  leadId: string,
  quoteId: string,
  numero: string | null,
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const replyTo = user?.email ?? undefined;
  const account = resolveSender(user?.email);
  if (!account) return { ok: false, error: "Aucun expéditeur Gmail configuré." };

  // 1) Récupère le PDF du devis depuis Pennylane.
  const pdf = await getQuotePdfUrl(quoteId);
  if (!pdf.ok || !pdf.url)
    return {
      ok: false,
      error: pdf.error ?? "PDF du devis indisponible (réessaie dans une minute).",
    };
  let pdfBase64: string;
  try {
    const r = await fetch(pdf.url);
    if (!r.ok) return { ok: false, error: `Téléchargement PDF ${r.status}.` };
    pdfBase64 = Buffer.from(await r.arrayBuffer()).toString("base64");
  } catch {
    return { ok: false, error: "Échec du téléchargement du PDF." };
  }
  const filename = `Devis-${(numero ?? quoteId).replace(/[^\w.-]+/g, "_")}.pdf`;

  const html = body
    .split("\n")
    .map((l) => (l.trim() ? `<p>${escapeHtml(l)}</p>` : "<br/>"))
    .join("");
  const raw = buildRawWithPdf(account.from, to, subject, html, pdfBase64, filename, replyTo);

  try {
    const client = new OAuth2Client(clientId, clientSecret);
    client.setCredentials({ refresh_token: account.refreshToken });
    const at = await client.getAccessToken();
    const token = typeof at === "string" ? at : at?.token;
    if (!token) return { ok: false, error: "Auth Gmail échouée." };
    const res = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      },
    );
    if (!res.ok) {
      const detail = await res.text();
      return { ok: false, error: `Gmail ${res.status} — ${detail.slice(0, 300)}` };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Échec envoi : ${msg.slice(0, 300)}` };
  }

  // Envoi RÉEL : la fiche avance en « Devis envoyé » + relance à +3 j + journal.
  await marquerDevisEnvoye({
    leadId,
    userId: await currentUserId(),
    numero,
    via: `par email à ${to}`,
    quoteId,
  });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/kanban");
  revalidatePath("/liste");
  return { ok: true, error: null };
}
