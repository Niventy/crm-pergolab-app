"use server";

import { buildQuoteAppUrl, getQuotePdfUrl } from "@/lib/pennylane";

// URL de l'éditeur Pennylane d'un devis.
export async function devisAppUrl(quoteId: string) {
  return buildQuoteAppUrl(quoteId);
}

// URL fraîche du PDF d'un devis Pennylane (le lien expire ~30 min).
export async function devisPdfUrl(quoteId: string) {
  return getQuotePdfUrl(quoteId);
}
