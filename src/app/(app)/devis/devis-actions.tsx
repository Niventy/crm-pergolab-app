"use client";

import Link from "next/link";
import { ExternalLink, Download, User, Pencil } from "lucide-react";
import { ouvrirDans } from "@/lib/ouvrir-dans";
import { devisAppUrl, devisPdfUrl } from "./actions";

export function DevisActions({
  externalId,
  leadId,
  devisId,
}: {
  externalId: string | null;
  leadId: string;
  devisId: string;
}) {
  return (
    <div className="flex items-center justify-end gap-3 whitespace-nowrap">
      <Link
        href={`/leads/${leadId}/devis/${devisId}`}
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        <Pencil className="size-3.5" /> Éditer
      </Link>
      {externalId ? (
        <>
          <button
            type="button"
            onClick={() => ouvrirDans(() => devisAppUrl(externalId))}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="size-3.5" /> Pennylane
          </button>
          <button
            type="button"
            onClick={() => ouvrirDans(() => devisPdfUrl(externalId))}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Download className="size-3.5" /> PDF
          </button>
        </>
      ) : null}
      <Link
        href={`/leads/${leadId}`}
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <User className="size-3.5" /> Fiche
      </Link>
    </div>
  );
}
