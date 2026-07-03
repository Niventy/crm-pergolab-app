// Intégration Pennylane (API externe v2, Bearer = Company API Token).
// Le devis est composé DANS le CRM (éditeur de lignes) puis créé à la demande.
// No-op / erreur claire si PENNYLANE_API_KEY absent.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leads, devis, type Lead } from "@/db/schema";

const BASE = "https://app.pennylane.com/api/external/v2";

export type DevisLine = {
  designation: string;
  quantite: number;
  prixHt: number;
  tva: number; // en % (20, 10, 5.5, 0…)
  productId?: number | null; // si issu d'une présélection produit Pennylane
};

export type ProduitPL = {
  id: number;
  label: string;
  description: string | null;
  prixHt: number;
  tva: number;
  reference: string | null;
};

// « FR_200 » → 20, « FR_055 » → 5.5.
function vatToNumber(code: string | number | null | undefined): number {
  if (typeof code === "number") return code;
  const m = String(code ?? "").match(/(\d+)/);
  return m ? Number(m[1]) / 10 : 20;
}

function plHeaders() {
  return {
    Authorization: `Bearer ${process.env.PENNYLANE_API_KEY}`,
    "Content-Type": "application/json",
  };
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// « 20 » → « FR_200 », « 5.5 » → « FR_055 », « 0 » → « FR_000 ».
function vatCode(tva: number): string {
  return `FR_${String(Math.round((tva || 0) * 10)).padStart(3, "0")}`;
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

// POST /quotes → id + n° + lien du devis créé (à partir des lignes composées).
async function createQuote(
  customerId: number,
  lines: DevisLine[],
): Promise<{
  id: number | null;
  number?: string | null;
  link?: string | null;
  error?: string;
}> {
  const now = new Date();
  const deadline = new Date(now.getTime() + 30 * 86400000);

  const body = {
    date: ymd(now),
    deadline: ymd(deadline),
    customer_id: customerId,
    currency: "EUR",
    invoice_lines: lines.map((l) =>
      l.productId
        ? {
            product_id: l.productId,
            quantity: l.quantite || 1,
            label: l.designation || undefined,
            raw_currency_unit_price: String(l.prixHt ?? 0),
            unit: "pièce",
            vat_rate: vatCode(l.tva),
          }
        : {
            label: l.designation || "Prestation",
            quantity: l.quantite || 1,
            raw_currency_unit_price: String(l.prixHt ?? 0),
            unit: "pièce",
            vat_rate: vatCode(l.tva),
          },
    ),
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

// Crée le devis Pennylane à partir des lignes composées dans le CRM.
// Réutilise le client Pennylane du lead s'il existe déjà.
export async function creerDevisPennylane(
  leadId: string,
  lines?: DevisLine[],
): Promise<{
  ok: boolean;
  numero?: string;
  lien?: string | null;
  error?: string;
  quoteId?: string;
}> {
  if (!process.env.PENNYLANE_API_KEY)
    return { ok: false, error: "Pennylane non configuré (clé API manquante)." };

  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead) return { ok: false, error: "Lead introuvable." };

  // Sans lignes fournies : 1 ligne de départ tirée du lead (on finalise dans Pennylane).
  const useLines: DevisLine[] =
    lines && lines.length
      ? lines
      : [
          {
            designation:
              `Pergola${lead.gamme ? ` ${lead.gamme}` : ""}${
                lead.dimensions ? ` ${lead.dimensions}` : ""
              }`.trim() || "Pergola sur mesure",
            quantite: 1,
            prixHt: Number(lead.montant ?? 0) || 0,
            tva: 20,
          },
        ];

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

  const q = await createQuote(customerId, useLines);
  if (!q.id) return { ok: false, error: q.error };

  const totalHt = useLines.reduce(
    (a, l) => a + (l.quantite || 0) * (l.prixHt || 0),
    0,
  );

  await db
    .update(leads)
    .set({ pennylaneQuoteId: String(q.id) })
    .where(eq(leads.id, leadId));
  await db.insert(devis).values({
    leadId,
    numero: q.number ?? `PL-${q.id}`,
    montant: String(totalHt),
    statut: "Devis Pennylane",
    lienExterne: q.link ?? null,
    externalId: String(q.id),
  });

  return {
    ok: true,
    numero: q.number ?? `PL-${q.id}`,
    lien: q.link,
    quoteId: String(q.id),
  };
}

// GET /products → catalogue de présélections pour l'éditeur de devis.
export async function listProduitsPennylane(): Promise<{
  ok: boolean;
  produits?: ProduitPL[];
  error?: string;
}> {
  if (!process.env.PENNYLANE_API_KEY)
    return { ok: false, error: "Pennylane non configuré." };
  const res = await fetch(`${BASE}/products`, { headers: plHeaders() });
  if (!res.ok) {
    const t = await res.text();
    return { ok: false, error: `Produits ${res.status} — ${t.slice(0, 150)}` };
  }
  const j = (await res.json()) as
    | unknown[]
    | { items?: unknown[]; products?: unknown[] };
  const items = (
    Array.isArray(j) ? j : (j.items ?? j.products ?? [])
  ) as Record<string, unknown>[];
  const produits: ProduitPL[] = items.map((p) => ({
    id: Number(p.id),
    label: String(p.label ?? p.name ?? "(sans nom)"),
    description: (p.description as string) ?? null,
    prixHt: Number(p.unit_price ?? p.price ?? 0) || 0,
    tva: vatToNumber(p.vat_rate as string),
    reference: (p.reference as string) ?? null,
  }));
  return { ok: true, produits };
}

// GET /quotes/{id} → URL publique du PDF (valable ~30 min).
export async function getQuotePdfUrl(
  quoteId: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (!process.env.PENNYLANE_API_KEY)
    return { ok: false, error: "Pennylane non configuré." };
  const res = await fetch(`${BASE}/quotes/${quoteId}`, { headers: plHeaders() });
  if (!res.ok) {
    const t = await res.text();
    return { ok: false, error: `Devis ${res.status} — ${t.slice(0, 150)}` };
  }
  const j = (await res.json()) as {
    public_file_url?: string;
    pdf_url?: string;
    file_url?: string;
  };
  const url = j.public_file_url ?? j.pdf_url ?? j.file_url ?? null;
  if (!url) return { ok: false, error: "PDF indisponible pour l'instant." };
  return { ok: true, url };
}

// Id de la société (pour construire l'URL de l'éditeur). Via env ou GET /me.
async function getCompanyId(): Promise<string | null> {
  if (process.env.PENNYLANE_COMPANY_ID) return process.env.PENNYLANE_COMPANY_ID;
  if (!process.env.PENNYLANE_API_KEY) return null;
  try {
    const res = await fetch(`${BASE}/me`, { headers: plHeaders() });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      company?: { id?: number | string };
      company_id?: number | string;
      id?: number | string;
    };
    return String(j.company?.id ?? j.company_id ?? j.id ?? "") || null;
  } catch {
    return null;
  }
}

// URL de l'éditeur de devis dans l'app Pennylane. Pattern configurable via
// PENNYLANE_QUOTE_URL (jetons {company} / {quote}) car non documenté par Pennylane.
export async function buildQuoteAppUrl(quoteId: string): Promise<string> {
  const template =
    process.env.PENNYLANE_QUOTE_URL ??
    "https://app.pennylane.com/companies/{company}/quotes/{quote}";
  const cid = await getCompanyId();
  if (!cid) return "https://app.pennylane.com";
  return template.replace("{company}", cid).replace("{quote}", quoteId);
}
