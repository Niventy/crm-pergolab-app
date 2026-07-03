"use client";

import Link from "next/link";
import { ExternalLink, Download, User } from "lucide-react";
import { toast } from "sonner";
import { devisAppUrl, devisPdfUrl } from "./actions";

// Ouvre une URL Pennylane dans un onglet créé DANS le geste (anti-popup-blocker).
function ouvrirDans(
  getUrl: () => Promise<{ ok?: boolean; url?: string; error?: string } | string>,
) {
  const w = window.open("", "_blank");
  Promise.resolve(getUrl()).then((r) => {
    const url = typeof r === "string" ? r : r.url;
    if (url && w) w.location.href = url;
    else {
      if (w) w.close();
      toast.error((typeof r === "object" && r.error) || "Lien indisponible");
    }
  });
}

export function DevisActions({
  externalId,
  leadId,
}: {
  externalId: string | null;
  leadId: string;
}) {
  return (
    <div className="flex items-center justify-end gap-3 whitespace-nowrap">
      {externalId ? (
        <>
          <button
            type="button"
            onClick={() => ouvrirDans(() => devisAppUrl(externalId))}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <ExternalLink className="size-3.5" /> Éditer
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
