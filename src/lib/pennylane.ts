// Intégration Pennylane (API externe v2, Bearer = Company API Token).
// Le devis est composé DANS le CRM (éditeur de lignes) puis créé à la demande.
// No-op / erreur claire si PENNYLANE_API_KEY absent.

import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { leads, devis, factures, type Lead } from "@/db/schema";
import {
  totalHt as calcTotalHt,
  totalTtc,
  r2,
  htDeLignesFacture,
  ttcDeLignesFacture,
  type LigneFacture,
} from "@/lib/devis-calc";

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

// La pergola (kit) reste toujours en tête du devis.
function isPergolaKit(l: DevisLine): boolean {
  return /^Pergola\s+\S/i.test(l.designation.trim());
}

// Ligne de remise commerciale (montant négatif), placée avant la clause.
function isRemiseLine(l: DevisLine): boolean {
  return l.designation.trim().toLowerCase().startsWith("remise commerciale");
}

// Ordonne et normalise les lignes envoyées à Pennylane :
// 1) pergola (kit) · 2) options / produits (ordre conservé) · 3) remise
// commerciale · 4) clause suspensive TOUJOURS en dernier. Une seule clause.
function withClause(lines: DevisLine[]): DevisLine[] {
  const sansClause = lines.filter((l) => !isClauseLine(l));
  const pergola = sansClause.filter(isPergolaKit);
  const remise = sansClause.filter(isRemiseLine);
  const reste = sansClause.filter((l) => !isPergolaKit(l) && !isRemiseLine(l));
  return [...pergola, ...reste, ...remise, CLAUSE_LINE];
}

// Échéancier de règlement (acompte / livraison / solde), surchargeable via
// PENNYLANE_ECHEANCIER = "40,40,20". Doit totaliser 100 (sinon on retombe sur
// 40/40/20 pour ne jamais annoncer un échéancier faux au client).
export function echeancierPct(): [number, number, number] {
  const raw = (process.env.PENNYLANE_ECHEANCIER ?? "40,40,20")
    .split(",")
    .map((s) => Number(s.trim()));
  if (raw.length !== 3 || raw.some((n) => !Number.isFinite(n) || n < 0))
    return [40, 40, 20];
  const [a, l, s] = raw;
  if (Math.round(a + l + s) !== 100) return [40, 40, 20];
  return [a, l, s];
}

const eurFr = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    Math.round(n * 100) / 100,
  );

// Bloc « Modalités et conditions de règlement » (champ special_mention du devis),
// avec les montants calculés depuis le total TTC.
function modalitesReglement(ttc: number): string {
  const [pa, pl, ps] = echeancierPct();
  const a = (ttc * pa) / 100;
  const l = (ttc * pl) / 100;
  const s = (ttc * ps) / 100;
  return `MODALITÉS ET CONDITIONS DE RÈGLEMENT

Acompte : ${pa} % à la commande, soit ${eurFr(a)}.
Le règlement du montant total du présent devis (TTC ${eurFr(ttc)}) s'effectuera selon l'échéancier suivant :

1. Acompte à la commande : ${pa} % du montant total (${eurFr(a)}). Ce premier versement est exigible à la signature du devis et vaut validation définitive de la commande. La production ne pourra débuter qu'après encaissement de cet acompte.

2. Paiement à la livraison : ${pl} % du montant total (${eurFr(l)}). Ce second versement est exigible le jour de la livraison des matériaux sur site, avant le démarrage des travaux d'installation.

3. Solde à la réception : ${ps} % du montant total (${eurFr(s)}). Le solde est exigible immédiatement après la réception des travaux, sous réserve qu'elle soit prononcée sans réserve de la part du client.

Ce devis est valable 30 jours. Toute commande est soumise à l'acceptation préalable de nos conditions générales de vente.`;
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

// « FR_200 » → 20, « FR_55 » → 5.5, « exempt » → 0.
function vatToNumber(code: string | number | null | undefined): number {
  if (typeof code === "number") return code;
  const s = String(code ?? "");
  if (/exempt/i.test(s)) return 0;
  const m = s.match(/(\d+)/);
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
// 0 % = `exempt` (pas de code FR_0). Avant, un 0 % retombait SILENCIEUSEMENT
// sur 20 % : un produit exonéré était facturé avec 20 % de TVA.
// Exception : une ligne à 0 € (clause) reste en 20 % — sans effet sur le montant,
// et évite de dépendre de l'énum `exempt` pour une ligne purement informative.
export function vatCode(tva: number, prixHt = 1): string {
  const r = Math.round((tva || 0) * 10);
  if (r <= 0) return Math.abs(prixHt) < 0.005 ? "FR_200" : "exempt";
  return `FR_${String(r).padStart(2, "0")}`;
}

// Une ligne du CRM → payload de CRÉATION Pennylane.
// Issue d'une présélection => reste liée au produit (product_id).
function toLinePayload(l: DevisLine) {
  // Ligne-produit : Pennylane gère la description via product_id → on n'envoie
  // pas de description (sinon on écrase le texte enrichi du produit par du brut).
  // Ligne libre : on envoie la description saisie dans le CRM.
  const desc = l.productId ? undefined : l.description?.trim() || undefined;
  // Arrondi au centime AVANT envoi : le configurateur produit des flottants
  // (1234.5600000001) que Pennylane arrondit à sa façon → écarts CRM / PDF.
  const prix = String(r2(l.prixHt ?? 0));
  return l.productId
    ? {
        product_id: l.productId,
        quantity: l.quantite || 1,
        label: l.designation || undefined,
        raw_currency_unit_price: prix,
        unit: "pièce",
        vat_rate: vatCode(l.tva, l.prixHt),
        ...discountPayload(l.remisePct),
      }
    : {
        label: l.designation || "Prestation",
        description: desc,
        quantity: l.quantite || 1,
        raw_currency_unit_price: prix,
        unit: "pièce",
        vat_rate: vatCode(l.tva, l.prixHt),
        ...discountPayload(l.remisePct),
      };
}

function toInvoiceLines(lines: DevisLine[]) {
  return lines.map(toLinePayload);
}

// Lignes « métier » d'un devis = sans la clause (0 €), pour les totaux / snapshot.
function sansClause(lines: DevisLine[]): DevisLine[] {
  return lines.filter((l) => !isClauseLine(l));
}

// Instantané stocké dans `devis.lignes` (seuls les champs de calcul + libellé).
function snapshotLignes(lines: DevisLine[]) {
  return sansClause(lines).map((l) => ({
    designation: l.designation,
    description: l.description ?? null,
    quantite: l.quantite,
    prixHt: r2(l.prixHt),
    tva: l.tva,
    remisePct: l.remisePct ?? null,
    productId: l.productId ?? null,
  }));
}

// Le montant du lead (pipeline, CA, facturation) suit un devis UNIQUEMENT si
// aucun autre devis n'a été accepté : sinon c'est le devis accepté qui fait foi
// (sans ça, « Dupliquer » une variante écrasait le montant signé).
async function syncMontantLead(
  leadId: string,
  devisId: string | null,
  totaux: { ht: number; ttc: number },
) {
  const [accepte] = await db
    .select({ id: devis.id })
    .from(devis)
    .where(and(eq(devis.leadId, leadId), isNotNull(devis.accepteAt)))
    .limit(1);
  if (accepte && accepte.id !== devisId) return;
  await db
    .update(leads)
    .set({ montant: String(totaux.ht), montantTtc: String(totaux.ttc) })
    .where(eq(leads.id, leadId));
}

// Adresse de facturation commune aux deux types de client Pennylane.
function billingAddress(lead: Lead) {
  return {
    address: lead.adresse || "À compléter",
    postal_code: lead.codePostal || "",
    city: lead.ville || "À compléter",
    country_alpha2: "FR",
  };
}

// Un lead avec une raison sociale est un client PROFESSIONNEL → `company_customer`
// (raison sociale + SIRET + TVA intracom sur le PDF) ; sinon `individual_customer`.
export type CustomerType = "individual" | "company";
export function typeClientPennylane(lead: Lead): CustomerType {
  return (lead.entreprise ?? "").trim() ? "company" : "individual";
}

function customerBody(lead: Lead, type: CustomerType) {
  const commun = {
    ...(lead.telephone ? { phone: lead.telephone } : {}),
    ...(lead.email ? { emails: [lead.email] } : {}),
    billing_address: billingAddress(lead),
  };
  if (type === "company") {
    const siret = (lead.siret ?? "").replace(/\s/g, "");
    const tva = (lead.tvaIntracom ?? "").replace(/\s/g, "").toUpperCase();
    return {
      name: (lead.entreprise ?? "").trim(),
      ...(siret ? { reg_no: siret } : {}),
      ...(tva ? { vat_number: tva } : {}),
      ...commun,
    };
  }
  const parts = (lead.nom ?? "").trim().split(/\s+/);
  return {
    first_name: parts[0] || "Client",
    last_name: parts.slice(1).join(" ") || parts[0] || "Pergolab",
    ...commun,
  };
}

// POST /individual_customers ou /company_customers → id + type du client créé.
async function createCustomer(
  lead: Lead,
): Promise<{ id: number | null; type: CustomerType; error?: string }> {
  const type = typeClientPennylane(lead);
  const body = { ...customerBody(lead, type), billing_language: "fr_FR" };

  const res = await fetch(`${BASE}/${type}_customers`, {
    method: "POST",
    headers: plHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    return { id: null, type, error: `Client ${res.status} — ${t.slice(0, 200)}` };
  }
  const j = (await res.json()) as { id?: number };
  return { id: j.id ?? null, type };
}

// Met à jour l'identité / l'adresse de facturation d'un client Pennylane déjà
// créé (l'adresse était souvent « À compléter » à la création). Best-effort.
// La route dépend du type mémorisé à la création (un particulier devenu « pro »
// dans le CRM reste un individual_customer côté Pennylane : on ne migre pas).
async function updateCustomer(customerId: number, lead: Lead): Promise<void> {
  const type: CustomerType =
    lead.pennylaneCustomerType === "company" || lead.pennylaneCustomerType === "individual"
      ? lead.pennylaneCustomerType
      : "individual";
  try {
    await fetch(`${BASE}/${type}_customers/${customerId}`, {
      method: "PUT",
      headers: plHeaders(),
      body: JSON.stringify(customerBody(lead, type)),
    });
  } catch {
    // non bloquant
  }
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

  const lignes = withClause(lines); // pergola → options → remise → clause
  const body = {
    date: ymd(now),
    deadline: ymd(deadline),
    customer_id: customerId,
    currency: "EUR",
    special_mention: modalitesReglement(totalTtc(lignes)), // échéancier
    invoice_lines: toInvoiceLines(lignes),
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
  config?: unknown,
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
      .set({ pennylaneCustomerId: String(customerId), pennylaneCustomerType: c.type })
      .where(eq(leads.id, leadId));
  } else {
    // Client déjà créé : on pousse l'adresse / le nom à jour (saisis depuis le CRM).
    await updateCustomer(customerId, lead);
  }

  // Crée le contact signataire s'il manque (nouveau OU ancien client sans contact).
  await ensureCustomerContact(customerId, lead);

  const q = await createQuote(customerId, useLines);
  if (!q.id) return { ok: false, error: q.error };

  const metier = sansClause(useLines);
  const ht = calcTotalHt(metier);
  const ttc = totalTtc(metier);

  await db
    .update(leads)
    .set({ pennylaneQuoteId: String(q.id) })
    .where(eq(leads.id, leadId));
  const [row] = await db
    .insert(devis)
    .values({
      leadId,
      numero: q.number ?? `PL-${q.id}`,
      montant: String(ht),
      montantTtc: String(ttc),
      lignes: snapshotLignes(useLines),
      config: config ?? null,
      statut: "Brouillon",
      lienExterne: q.link ?? null,
      externalId: String(q.id),
    })
    .returning({ id: devis.id });

  // Le montant du devis devient le montant du lead (pipeline / CA / facturation),
  // sauf si un autre devis est déjà accepté.
  await syncMontantLead(leadId, row?.id ?? null, { ht, ttc });

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
): Promise<{
  ok: boolean;
  totalHt?: number;
  totalTtc?: number;
  lignes?: ReturnType<typeof snapshotLignes>;
  error?: string;
}> {
  if (!process.env.PENNYLANE_API_KEY)
    return { ok: false, error: "Pennylane non configuré." };
  if (!lines.length) return { ok: false, error: "Ajoute au moins une ligne." };

  // Pergola en tête · options/produits · clause en dernier.
  const lignes = withClause(lines);

  // Pennylane ne garantit pas l'ordre d'affichage des lignes (souvent par id).
  // Pour forcer « pergola d'abord, clause en dernier », on RECRÉE toutes les
  // lignes dans l'ordre voulu et on supprime les anciennes : les nouveaux id
  // sont ainsi attribués dans le bon ordre. On ne diffe plus.
  const actuel = await getQuoteLines(quoteId);
  const idsActuels = (actuel.lines ?? [])
    .map((l) => l.id)
    .filter((id): id is number => typeof id === "number");

  const invoice_lines: Record<string, unknown> = {
    create: lignes.map(toLinePayload),
  };
  if (idsActuels.length)
    invoice_lines.delete = idsActuels.map((id) => ({ id }));

  const res = await fetch(`${BASE}/quotes/${quoteId}`, {
    method: "PUT",
    headers: plHeaders(),
    // On réaffirme aussi l'échéancier (montants recalculés) à chaque édition.
    body: JSON.stringify({
      special_mention: modalitesReglement(totalTtc(lignes)),
      invoice_lines,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    return { ok: false, error: `Maj devis ${res.status} — ${t.slice(0, 200)}` };
  }
  const metier = sansClause(lignes);
  return {
    ok: true,
    totalHt: calcTotalHt(metier),
    totalTtc: totalTtc(metier),
    lignes: snapshotLignes(lignes),
  };
}

// Enregistre en base les totaux + l'instantané des lignes d'un devis modifié,
// et propage le montant au lead si ce devis fait foi.
export async function enregistrerDevisModifie(
  leadId: string,
  devisId: string,
  r: { totalHt?: number; totalTtc?: number; lignes?: unknown },
  config?: unknown,
) {
  const ht = r.totalHt ?? 0;
  const ttc = r.totalTtc ?? 0;
  await db
    .update(devis)
    .set({
      montant: String(ht),
      montantTtc: String(ttc),
      lignes: r.lignes ?? null,
      ...(config !== undefined ? { config: config ?? null } : {}),
    })
    .where(eq(devis.id, devisId));
  await syncMontantLead(leadId, devisId, { ht, ttc });
}

// GET /quotes/{id} → statut Pennylane brut (ex. draft / sent / accepted / signed /
// invoiced…) + s'il est verrouillé côté Pennylane (accepté, signé ou facturé).
export async function getQuoteStatus(
  quoteId: string,
): Promise<{ ok: boolean; status?: string | null; verrouille?: boolean; error?: string }> {
  if (!process.env.PENNYLANE_API_KEY)
    return { ok: false, error: "Pennylane non configuré." };
  try {
    const res = await fetch(`${BASE}/quotes/${quoteId}`, { headers: plHeaders() });
    if (!res.ok) return { ok: false, error: `Devis ${res.status}` };
    const j = (await res.json()) as {
      status?: string;
      quote_status?: string;
      signed?: boolean;
      accepted?: boolean;
      invoiced?: boolean;
    };
    const status = j.status ?? j.quote_status ?? null;
    const verrouille =
      !!j.signed ||
      !!j.accepted ||
      !!j.invoiced ||
      /accept|sign|invoic|factur/i.test(status ?? "");
    return { ok: true, status, verrouille };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg.slice(0, 120) };
  }
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
  specialMention?: string,
): Promise<{ id: number | null; number?: string | null; status?: string | null; error?: string }> {
  const now = new Date();
  const deadline = new Date(now.getTime() + 30 * 86400000);
  const body = {
    customer_id: customerId,
    date: ymd(now),
    deadline: ymd(deadline),
    currency: "EUR",
    draft,
    ...(specialMention ? { special_mention: specialMention } : {}),
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
// `lignes` = UNE ligne HT par taux de TVA (calculées depuis le devis accepté) :
// le TTC facturé reproduit exactement la TVA du devis, même à taux multiples.
export async function creerFacturePennylane(
  leadId: string,
  opts: {
    type: "acompte" | "solde" | "finale";
    lignes: LigneFacture[];
    mention?: string; // rappel du devis + des acomptes déjà facturés
    draft?: boolean;
  },
): Promise<{ ok: boolean; error?: string; numero?: string | null; factureId?: string }> {
  if (!process.env.PENNYLANE_API_KEY)
    return { ok: false, error: "Pennylane non configuré (clé API manquante)." };
  const lignes = opts.lignes.filter((l) => l.prixHt > 0);
  if (!lignes.length) return { ok: false, error: "Montant invalide." };

  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead) return { ok: false, error: "Lead introuvable." };

  let customerId = lead.pennylaneCustomerId ? Number(lead.pennylaneCustomerId) : null;
  if (!customerId) {
    const c = await createCustomer(lead);
    if (!c.id) return { ok: false, error: c.error };
    customerId = c.id;
    await db
      .update(leads)
      .set({ pennylaneCustomerId: String(customerId), pennylaneCustomerType: c.type })
      .where(eq(leads.id, leadId));
  }

  const inv = await createInvoice(
    customerId,
    lignes.map((l) => ({ ...l, quantite: 1 as number })),
    opts.draft ?? true,
    opts.mention,
  );
  if (!inv.id) return { ok: false, error: inv.error };

  const [row] = await db
    .insert(factures)
    .values({
      leadId,
      type: opts.type,
      numero: inv.number ?? `PL-${inv.id}`,
      externalId: String(inv.id),
      montantHt: String(htDeLignesFacture(lignes)),
      montantTtc: String(ttcDeLignesFacture(lignes)),
      lignes,
      statut: inv.status ?? (opts.draft ?? true ? "draft" : "finalized"),
    })
    .returning({ id: factures.id });

  return { ok: true, numero: inv.number ?? `PL-${inv.id}`, factureId: row?.id };
}

// GET /customer_invoices/{id} → statut actuel, ou `exists: false` si la facture a
// été supprimée dans Pennylane (brouillon effacé) : elle ne doit plus compter
// dans le « déjà facturé ».
export async function getFactureStatut(
  invoiceId: string,
): Promise<{ ok: boolean; exists: boolean; status?: string | null; error?: string }> {
  if (!process.env.PENNYLANE_API_KEY)
    return { ok: false, exists: true, error: "Pennylane non configuré." };
  try {
    const res = await fetch(`${BASE}/customer_invoices/${invoiceId}`, {
      headers: plHeaders(),
    });
    if (res.status === 404) return { ok: true, exists: false };
    if (!res.ok) return { ok: false, exists: true, error: `Erreur ${res.status}` };
    const j = (await res.json()) as { status?: string; draft?: boolean };
    const status = j.status ?? (j.draft === false ? "finalized" : j.draft ? "draft" : null);
    return { ok: true, exists: true, status };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, exists: true, error: msg.slice(0, 120) };
  }
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
