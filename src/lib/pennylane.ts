// Intégration Pennylane (API externe v2, Bearer = Company API Token).
// Le devis est composé DANS le CRM (éditeur de lignes) puis créé à la demande.
// No-op / erreur claire si PENNYLANE_API_KEY absent.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leads, devis, factures, type Lead } from "@/db/schema";

const BASE = "https://app.pennylane.com/api/external/v2";

// Clause légale ajoutée comme OPTION à 0 € sur CHAQUE devis (ligne dédiée).
// Le libellé (surchargeable via PENNYLANE_CLAUSE_LABEL) et le texte détaillé
// (PENNYLANE_CLAUSE) apparaissent tels quels sur le PDF.
const CLAUSE_LABEL =
  process.env.PENNYLANE_CLAUSE_LABEL ?? "Clause suspensive – faisabilité technique";
const CLAUSE_TEXTE =
  process.env.PENNYLANE_CLAUSE ??
  `Le présent devis est établi sous réserve de la validation des conditions techniques lors de la visite sur site et de la prise de cotes définitives.
La réalisation du projet dépend notamment de la nature des supports, des contraintes de pose et de l'accessibilité.
En cas de contraintes techniques imprévues nécessitant une adaptation, un devis modificatif pourra être proposé.
Si aucune solution ne peut être mise en œuvre, le devis pourra être annulé sans frais, avec remboursement des sommes éventuellement versées.`;

// La ligne « clause » : quantité 1, 0 € HT. TVA 20 % (sans effet à 0 €) car le
// taux 0 % n'existe pas côté Pennylane et ferait échouer la création du devis.
const CLAUSE_LINE: DevisLine = {
  designation: CLAUSE_LABEL,
  description: CLAUSE_TEXTE,
  quantite: 1,
  prixHt: 0,
  tva: 20,
};

function isClauseLine(l: DevisLine): boolean {
  return l.designation.trim().toLowerCase().startsWith("clause suspensive");
}

// Garantit exactement une ligne clause (0 €), en fin de devis, sur chaque devis.
function withClause(lines: DevisLine[]): DevisLine[] {
  return lines.some(isClauseLine) ? lines : [...lines, CLAUSE_LINE];
}

export type DevisLine = {
  id?: number | null; // id de la ligne côté Pennylane (si elle existe déjà)
  designation: string;
  description?: string | null; // description produit (apparaît sur le devis)
  quantite: number;
  prixHt: number;
  tva: number; // en % (20, 10, 5.5, 0…)
  productId?: number | null; // si issu d'une présélection produit Pennylane
  remisePct?: number | null; // remise en % sur la ligne (ex. 10 = -10%)
};

// Remise Pennylane : { type: "relative" (=%), value } — omise si nulle/zéro.
function discountPayload(remisePct?: number | null) {
  const r = Number(remisePct ?? 0);
  if (!r || r <= 0) return {};
  return { discount: { type: "relative", value: String(r) } };
}

// HT d'une ligne, remise (%) déduite.
function ligneHt(l: DevisLine): number {
  const brut = (l.quantite || 0) * (l.prixHt || 0);
  const r = Number(l.remisePct ?? 0);
  return r > 0 ? brut * (1 - r / 100) : brut;
}

// Lit une remise Pennylane → % (on ne gère que les remises "relative"/%).
function parseRemise(d: unknown): number | null {
  if (!d || typeof d !== "object") return null;
  const o = d as { type?: string; value?: string | number };
  if (o.type !== "relative") return null;
  const v = Number(o.value ?? 0);
  return v > 0 ? v : null;
}

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

// Code TVA Pennylane = « FR_ » + taux×10, cadré à 2 chiffres mini (PAS 3) :
// 20 → FR_200 · 10 → FR_100 · 5.5 → FR_55 · 2.1 → FR_21 · 0.9 → FR_09.
// ⚠️ 0 % n'existe pas dans l'énum Pennylane (mini FR_1_05) → on retombe sur 20 %
// (sans effet sur une ligne à 0 €, mais évite un rejet « FR_000/FR_00 » invalide).
function vatCode(tva: number): string {
  const r = Math.round((tva || 0) * 10);
  if (r <= 0) return "FR_200";
  return `FR_${String(r).padStart(2, "0")}`;
}

// Une ligne du CRM → payload de CRÉATION Pennylane.
// Issue d'une présélection => reste liée au produit (product_id).
function toLinePayload(l: DevisLine) {
  // Ligne-produit : Pennylane gère la description via product_id → on n'envoie
  // pas de description (sinon on écrase le texte enrichi du produit par du brut).
  // Ligne libre : on envoie la description saisie dans le CRM.
  const desc = l.productId ? undefined : l.description?.trim() || undefined;
  return l.productId
    ? {
        product_id: l.productId,
        quantity: l.quantite || 1,
        label: l.designation || undefined,
        raw_currency_unit_price: String(l.prixHt ?? 0),
        unit: "pièce",
        vat_rate: vatCode(l.tva),
        ...discountPayload(l.remisePct),
      }
    : {
        label: l.designation || "Prestation",
        description: desc,
        quantity: l.quantite || 1,
        raw_currency_unit_price: String(l.prixHt ?? 0),
        unit: "pièce",
        vat_rate: vatCode(l.tva),
        ...discountPayload(l.remisePct),
      };
}

// Une ligne existante → payload de MISE À JOUR (id + valeurs éditables).
function toLineUpdatePayload(l: DevisLine) {
  return {
    id: l.id,
    label: l.designation || "Prestation",
    // Idem : pas de description sur une ligne-produit (gérée par Pennylane).
    ...(l.productId
      ? {}
      : { description: l.description?.trim() || undefined }),
    quantity: l.quantite || 1,
    raw_currency_unit_price: String(l.prixHt ?? 0),
    unit: "pièce",
    vat_rate: vatCode(l.tva),
    ...discountPayload(l.remisePct),
  };
}

function toInvoiceLines(lines: DevisLine[]) {
  return lines.map(toLinePayload);
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

// S'assure qu'un CONTACT (personne nommée + email) existe sur le client Pennylane.
// Sans contact, la signature électronique affiche « contact indisponible » car
// le corps de création du client n'accepte pas de tableau `contacts` : il faut un
// appel séparé POST /customers/{id}/contacts.
// Renvoie {ok,error} : `error` remonte le vrai message d'API (statut + corps) pour
// diagnostiquer, mais l'appel est optionnel côté création de devis (non bloquant).
async function ensureCustomerContact(
  customerId: number,
  lead: Lead,
): Promise<{ ok: boolean; created?: boolean; error?: string }> {
  const email = (lead.email ?? "").trim();
  if (!email)
    return { ok: false, error: "Le client n'a pas d'email : contact impossible." };

  // Déjà un contact avec cet email ? on ne recrée pas.
  try {
    const list = await fetch(`${BASE}/customers/${customerId}/contacts`, {
      headers: plHeaders(),
    });
    if (list.ok) {
      const j = (await list.json()) as { items?: { email?: string }[] };
      const existing = j.items ?? [];
      if (
        existing.some(
          (c) => (c.email ?? "").trim().toLowerCase() === email.toLowerCase(),
        )
      )
        return { ok: true, created: false };
    }
  } catch {
    // On tente quand même la création si la liste échoue.
  }

  const parts = (lead.nom ?? "").trim().split(/\s+/);
  const first_name = parts[0] || "Client";
  const last_name = parts.slice(1).join(" ") || parts[0] || "Pergolab";
  // Corps minimal : le téléphone est omis (format E.164 exigé, risque de 422).
  // Seul l'email compte pour la signature électronique.
  const body = { first_name, last_name, email };

  try {
    const res = await fetch(`${BASE}/customers/${customerId}/contacts`, {
      method: "POST",
      headers: plHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, error: `Contact ${res.status} — ${t.slice(0, 300)}` };
    }
    return { ok: true, created: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Contact — échec réseau : ${msg.slice(0, 200)}` };
  }
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
    invoice_lines: toInvoiceLines(withClause(lines)), // + clause à 0 €
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
    public_file_url?: string;
    public_url?: string;
    pdf_url?: string;
    file_url?: string;
  };
  return {
    id: j.id ?? null,
    number: j.quote_number ?? j.number ?? null,
    // Lien public client = public_file_url (le vrai champ Pennylane).
    link: j.public_file_url ?? j.public_url ?? j.pdf_url ?? j.file_url ?? null,
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
  devisId?: string;
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

  // Crée le contact signataire s'il manque (nouveau OU ancien client sans contact).
  await ensureCustomerContact(customerId, lead);

  const q = await createQuote(customerId, useLines);
  if (!q.id) return { ok: false, error: q.error };

  const totalHt = useLines.reduce(
    (a, l) => a + ligneHt(l),
    0,
  );

  // Le montant du devis devient le montant du lead : sans ça, le pipeline et
  // le CA du dashboard resteraient à 0 (ils se calculent sur leads.montant).
  await db
    .update(leads)
    .set({ pennylaneQuoteId: String(q.id), montant: String(totalHt) })
    .where(eq(leads.id, leadId));
  const [row] = await db
    .insert(devis)
    .values({
      leadId,
      numero: q.number ?? `PL-${q.id}`,
      montant: String(totalHt),
      statut: "Devis Pennylane",
      lienExterne: q.link ?? null,
      externalId: String(q.id),
    })
    .returning({ id: devis.id });

  return {
    ok: true,
    numero: q.number ?? `PL-${q.id}`,
    lien: q.link,
    quoteId: String(q.id),
    devisId: row?.id,
  };
}

// GET /quotes/{id}/invoice_lines → lignes existantes, pour rééditer dans le CRM.
export async function getQuoteLines(
  quoteId: string,
): Promise<{ ok: boolean; lines?: DevisLine[]; error?: string }> {
  if (!process.env.PENNYLANE_API_KEY)
    return { ok: false, error: "Pennylane non configuré." };
  const res = await fetch(`${BASE}/quotes/${quoteId}/invoice_lines`, {
    headers: plHeaders(),
  });
  if (!res.ok) {
    const t = await res.text();
    return { ok: false, error: `Lignes ${res.status} — ${t.slice(0, 150)}` };
  }
  const j = (await res.json()) as unknown[] | { items?: unknown[] };
  const items = (Array.isArray(j) ? j : (j.items ?? [])) as Record<
    string,
    unknown
  >[];
  const lines: DevisLine[] = items.map((l) => ({
    id: l.id ? Number(l.id) : null,
    designation: String(l.label ?? ""),
    // Description CRM uniquement pour les lignes libres (les lignes-produit ont
    // un texte enrichi géré par Pennylane, qu'on ne veut pas afficher en brut).
    description: l.product_id ? null : ((l.description as string) ?? null),
    quantite: Number(l.quantity ?? 1) || 1,
    prixHt:
      Number(
        l.raw_currency_unit_price ?? l.unit_price ?? l.currency_amount ?? 0,
      ) || 0,
    tva: vatToNumber(l.vat_rate as string),
    productId: l.product_id ? Number(l.product_id) : null,
    remisePct: parseRemise(l.discount),
  }));
  return { ok: true, lines };
}

// Crée/complète le CONTACT signataire du client Pennylane d'un lead existant.
// Utile pour un client déjà créé sans contact (signature « contact indisponible »).
export async function assurerContactPennylane(
  leadId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.PENNYLANE_API_KEY)
    return { ok: false, error: "Pennylane non configuré." };
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead) return { ok: false, error: "Lead introuvable." };
  if (!lead.pennylaneCustomerId)
    return { ok: false, error: "Aucun client Pennylane pour ce lead." };
  if (!lead.email)
    return { ok: false, error: "Ce lead n'a pas d'email (contact impossible)." };
  return ensureCustomerContact(Number(lead.pennylaneCustomerId), lead);
}

// PUT /quotes/{id} → remplace les lignes du devis (édition depuis le CRM).
export async function updateQuotePennylane(
  quoteId: string,
  lines: DevisLine[],
): Promise<{ ok: boolean; totalHt?: number; error?: string }> {
  if (!process.env.PENNYLANE_API_KEY)
    return { ok: false, error: "Pennylane non configuré." };
  if (!lines.length) return { ok: false, error: "Ajoute au moins une ligne." };

  // La clause (0 €) doit rester présente sur chaque devis.
  const lignes = withClause(lines);

  // Pennylane attend un OBJET { create, update, delete }, pas un tableau.
  // On diffe contre l'état réel du devis pour savoir quoi supprimer.
  const actuel = await getQuoteLines(quoteId);
  const idsActuels = (actuel.lines ?? [])
    .map((l) => l.id)
    .filter((id): id is number => typeof id === "number");
  const idsGardes = new Set(
    lignes.map((l) => l.id).filter((id): id is number => typeof id === "number"),
  );

  const create = lignes.filter((l) => !l.id).map(toLinePayload);
  const update = lignes.filter((l) => l.id).map(toLineUpdatePayload);
  const supprime = idsActuels
    .filter((id) => !idsGardes.has(id))
    .map((id) => ({ id }));

  const invoice_lines: Record<string, unknown> = {};
  if (create.length) invoice_lines.create = create;
  if (update.length) invoice_lines.update = update;
  if (supprime.length) invoice_lines.delete = supprime;

  const res = await fetch(`${BASE}/quotes/${quoteId}`, {
    method: "PUT",
    headers: plHeaders(),
    body: JSON.stringify({ invoice_lines }),
  });
  if (!res.ok) {
    const t = await res.text();
    return { ok: false, error: `Maj devis ${res.status} — ${t.slice(0, 200)}` };
  }
  const totalHt = lignes.reduce(
    (a, l) => a + ligneHt(l),
    0,
  );
  return { ok: true, totalHt };
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

// POST /quotes/{id}/send_by_email → envoie le devis (PDF) par email au client.
export async function envoyerDevisEmail(
  quoteId: string,
  recipients?: string[],
): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.PENNYLANE_API_KEY)
    return { ok: false, error: "Pennylane non configuré (clé API manquante)." };
  const clean = (recipients ?? []).map((e) => e.trim()).filter(Boolean);
  const body = clean.length ? { recipients: clean } : {};
  const res = await fetch(`${BASE}/quotes/${quoteId}/send_by_email`, {
    method: "POST",
    headers: plHeaders(),
    body: JSON.stringify(body),
  });
  if (res.status === 204 || res.ok) return { ok: true };
  if (res.status === 409)
    return {
      ok: false,
      error: "Le PDF du devis n'est pas encore prêt — réessaie dans une minute.",
    };
  const t = await res.text();
  return { ok: false, error: `Envoi ${res.status} — ${t.slice(0, 150)}` };
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

// URL de la page « Envoyer le devis pour e-signature » (Yousign via Pennylane).
// Pattern configurable via PENNYLANE_ESIGN_URL si l'id/route diffèrent.
export async function buildEsignatureUrl(quoteId: string): Promise<string> {
  const template =
    process.env.PENNYLANE_ESIGN_URL ??
    "https://app.pennylane.com/companies/{company}/clients/send_esignature?estimate_to_send_id={quote}";
  const cid = await getCompanyId();
  if (!cid) return "https://app.pennylane.com";
  return template.replace("{company}", cid).replace("{quote}", quoteId);
}

// ---------------------------------------------------------------------------
// Facturation — factures d'ACOMPTE et de SOLDE (POST /customer_invoices)
// ---------------------------------------------------------------------------

// Crée une facture client Pennylane (brouillon par défaut).
async function createInvoice(
  customerId: number,
  lines: DevisLine[],
  draft: boolean,
): Promise<{ id: number | null; number?: string | null; status?: string | null; error?: string }> {
  const now = new Date();
  const deadline = new Date(now.getTime() + 30 * 86400000);
  const body = {
    customer_id: customerId,
    date: ymd(now),
    deadline: ymd(deadline),
    currency: "EUR",
    draft,
    invoice_lines: toInvoiceLines(lines),
  };
  const res = await fetch(`${BASE}/customer_invoices`, {
    method: "POST",
    headers: plHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    return { id: null, error: `Facture ${res.status} — ${t.slice(0, 200)}` };
  }
  const j = (await res.json()) as {
    id?: number;
    invoice_number?: string;
    number?: string;
    status?: string;
  };
  return {
    id: j.id ?? null,
    number: j.invoice_number ?? j.number ?? null,
    status: j.status ?? null,
  };
}

// Crée une facture (acompte/solde) pour un lead + enregistre la ligne `factures`.
export async function creerFacturePennylane(
  leadId: string,
  opts: { type: "acompte" | "solde" | "finale"; libelle: string; montantHt: number; tva?: number; draft?: boolean },
): Promise<{ ok: boolean; error?: string; numero?: string | null; factureId?: string }> {
  if (!process.env.PENNYLANE_API_KEY)
    return { ok: false, error: "Pennylane non configuré (clé API manquante)." };
  if (!(opts.montantHt > 0)) return { ok: false, error: "Montant invalide." };

  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead) return { ok: false, error: "Lead introuvable." };

  let customerId = lead.pennylaneCustomerId ? Number(lead.pennylaneCustomerId) : null;
  if (!customerId) {
    const c = await createCustomer(lead);
    if (!c.id) return { ok: false, error: c.error };
    customerId = c.id;
    await db
      .update(leads)
      .set({ pennylaneCustomerId: String(customerId) })
      .where(eq(leads.id, leadId));
  }

  const line: DevisLine = {
    designation: opts.libelle,
    quantite: 1,
    prixHt: opts.montantHt,
    tva: opts.tva ?? 20,
  };
  const inv = await createInvoice(customerId, [line], opts.draft ?? true);
  if (!inv.id) return { ok: false, error: inv.error };

  const [row] = await db
    .insert(factures)
    .values({
      leadId,
      type: opts.type,
      numero: inv.number ?? `PL-${inv.id}`,
      externalId: String(inv.id),
      montantHt: String(opts.montantHt),
      statut: inv.status ?? (opts.draft ?? true ? "draft" : "finalized"),
    })
    .returning({ id: factures.id });

  return { ok: true, numero: inv.number ?? `PL-${inv.id}`, factureId: row?.id };
}

// GET /customer_invoices/{id} → URL publique du PDF de la facture.
export async function getFacturePdfUrl(
  invoiceId: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (!process.env.PENNYLANE_API_KEY)
    return { ok: false, error: "Pennylane non configuré." };
  const res = await fetch(`${BASE}/customer_invoices/${invoiceId}`, {
    headers: plHeaders(),
  });
  if (!res.ok) return { ok: false, error: `Erreur ${res.status}` };
  const j = (await res.json()) as {
    public_file_url?: string;
    pdf_url?: string;
    file_url?: string;
  };
  const url = j.public_file_url ?? j.pdf_url ?? j.file_url ?? null;
  if (!url) return { ok: false, error: "PDF indisponible pour l'instant." };
  return { ok: true, url };
}
