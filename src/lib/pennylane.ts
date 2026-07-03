// Intégration Pennylane (API externe v2, Bearer = Company API Token).
// À la signature d'un lead : crée le client + un devis, stocke n°/lien.
// No-op silencieux si PENNYLANE_API_KEY absent.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leads, devis, type Lead } from "@/db/schema";

const BASE = "https://app.pennylane.com/api/external/v2";

function plHeaders() {
  return {
    Authorization: `Bearer ${process.env.PENNYLANE_API_KEY}`,
    "Content-Type": "application/json",
  };
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// POST /individual_customers → id du client créé.
async function createCustomer(
  lead: Lead,
): Promise<{ id: number | null; error?: string }> {
  const parts = (lead.nom ?? "").trim().split(/\s+/);
  const first_name = parts[0] || "Client";
  const last_name = parts.slice(1).join(" ") || parts[0] || "Pergolab";

  const body = {
    first_name,
    last_name,
    ...(lead.telephone ? { phone: lead.telephone } : {}),
    ...(lead.email ? { emails: [lead.email] } : {}),
    billing_address: {
      address: lead.adresse || "À compléter",
      postal_code: lead.codePostal || "",
      city: lead.ville || "À compléter",
      country_alpha2: "FR",
    },
    billing_language: "fr_FR",
  };

  const res = await fetch(`${BASE}/individual_customers`, {
    method: "POST",
    headers: plHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    return { id: null, error: `Client ${res.status} — ${t.slice(0, 200)}` };
  }
  const j = (await res.json()) as { id?: number };
  return { id: j.id ?? null };
}

// POST /quotes → id + n° + lien du devis créé.
async function createQuote(
  customerId: number,
  lead: Lead,
): Promise<{
  id: number | null;
  number?: string | null;
  link?: string | null;
  error?: string;
}> {
  const now = new Date();
  const deadline = new Date(now.getTime() + 30 * 86400000);
  const label =
    `Pergola${lead.gamme ? ` ${lead.gamme}` : ""}${
      lead.dimensions ? ` ${lead.dimensions}` : ""
    }`.trim() || "Pergola sur mesure";

  const body = {
    date: ymd(now),
    deadline: ymd(deadline),
    customer_id: customerId,
    currency: "EUR",
    invoice_lines: [
      {
        label,
        quantity: 1,
        raw_currency_unit_price: String(lead.montant ?? "0"),
        unit: "pièce",
        vat_rate: "FR_200",
      },
    ],
  };

  const res = await fetch(`${BASE}/quotes`, {
    method: "POST",
    headers: plHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    return { id: null, error: `Devis ${res.status} — ${t.slice(0, 200)}` };
  }
  const j = (await res.json()) as {
    id?: number;
    quote_number?: string;
    number?: string;
    public_url?: string;
    pdf_url?: string;
    file_url?: string;
  };
  return {
    id: j.id ?? null,
    number: j.quote_number ?? j.number ?? null,
    link: j.public_url ?? j.pdf_url ?? j.file_url ?? null,
  };
}

// Crée client + devis Pennylane. Idempotent via pennylaneQuoteId.
export async function syncDevisPennylane(
  leadId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.PENNYLANE_API_KEY)
    return { ok: false, error: "Pennylane non configuré." };

  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead) return { ok: false, error: "Lead introuvable." };
  if (lead.pennylaneQuoteId) return { ok: true }; // déjà synchronisé

  let customerId = lead.pennylaneCustomerId
    ? Number(lead.pennylaneCustomerId)
    : null;
  if (!customerId) {
    const c = await createCustomer(lead);
    if (!c.id) return { ok: false, error: c.error };
    customerId = c.id;
    await db
      .update(leads)
      .set({ pennylaneCustomerId: String(customerId) })
      .where(eq(leads.id, leadId));
  }

  const q = await createQuote(customerId, lead);
  if (!q.id) return { ok: false, error: q.error };

  await db
    .update(leads)
    .set({ pennylaneQuoteId: String(q.id) })
    .where(eq(leads.id, leadId));
  await db.insert(devis).values({
    leadId,
    numero: q.number ?? `PL-${q.id}`,
    montant: lead.montant,
    statut: "Devis Pennylane",
    lienExterne: q.link ?? null,
  });

  return { ok: true };
}
