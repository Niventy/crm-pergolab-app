"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, FileText, Download, ExternalLink, Pencil, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { formatEuros } from "@/lib/format";
import { devisAppUrl, devisPdfUrl, dupliquerDevis } from "./actions";

type DevisRow = {
  id: string;
  numero: string | null;
  montant: string | null;
  statut: string | null;
  lienExterne: string | null;
  externalId: string | null;
};

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

export function DevisEditor({
  leadId,
  devisExistants,
  pennylaneConfigured,
}: {
  leadId: string;
  devisExistants: DevisRow[];
  pennylaneConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dupId, setDupId] = useState<string | null>(null);

  const dupliquer = (quoteId: string, id: string) => {
    setDupId(id);
    start(async () => {
      const r = await dupliquerDevis(leadId, quoteId);
      setDupId(null);
      if (r.ok && r.devisId) {
        toast.success("Devis dupliqué");
        router.push(`/leads/${leadId}/devis/${r.devisId}`);
      } else toast.error(r.error ?? "Échec de la duplication");
    });
  };

  return (
    <div className="space-y-4">
      {devisExistants.length > 0 ? (
        <ul className="divide-y divide-border">
          {devisExistants.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2 text-sm">
              <FileText className="size-4 text-muted-foreground" />
              <span className="font-medium text-foreground">{d.numero ?? "Devis"}</span>
              <span className="tabular-nums text-muted-foreground">
                {formatEuros(d.montant)}
              </span>
              {d.statut ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {d.statut}
                </span>
              ) : null}
              <span className="ml-auto flex items-center gap-3">
                <Link
                  href={`/leads/${leadId}/devis/${d.id}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <Pencil className="size-3.5" /> Éditer
                </Link>
                {d.externalId ? (
                  <>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => dupliquer(d.externalId!, d.id)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                      title="Créer un nouveau devis identique (variante avec / sans options)"
                    >
                      {pending && dupId === d.id ? (
                        <RefreshCw className="size-3.5 animate-spin" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                      Dupliquer
                    </button>
                    <button
                      type="button"
                      onClick={() => ouvrirDans(() => devisAppUrl(d.externalId!))}
                      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="size-3.5" /> Pennylane
                    </button>
                    <button
                      type="button"
                      onClick={() => ouvrirDans(() => devisPdfUrl(d.externalId!))}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <Download className="size-3.5" /> PDF
                    </button>
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Aucun devis pour l&apos;instant.</p>
      )}

      {!pennylaneConfigured ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Pennylane n&apos;est pas configuré (<code>PENNYLANE_API_KEY</code>).
        </p>
      ) : null}

      <Link
        href={`/leads/${leadId}/devis/nouveau`}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
      >
        <Plus className="size-4" /> Créer un devis
      </Link>
    </div>
  );
}
