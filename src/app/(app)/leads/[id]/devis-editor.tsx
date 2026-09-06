"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  FileText,
  Download,
  ExternalLink,
  Pencil,
  Copy,
  RefreshCw,
  BadgeCheck,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatEurosCents } from "@/lib/format";
import { ouvrirDans } from "@/lib/ouvrir-dans";
import { devisAppUrl, devisPdfUrl, dupliquerDevis, marquerDevisAccepte } from "./actions";

type DevisRow = {
  id: string;
  numero: string | null;
  montant: string | null; // HT
  montantTtc: string | null;
  statut: string | null;
  lienExterne: string | null;
  externalId: string | null;
  accepte: boolean; // devis signé par le client (un seul par fiche)
};

export function DevisEditor({
  leadId,
  devisExistants,
  pennylaneConfigured,
  choixRequis = false,
}: {
  leadId: string;
  devisExistants: DevisRow[];
  pennylaneConfigured: boolean;
  /** Client avec plusieurs devis et aucun signé : on met en avant le choix. */
  choixRequis?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dupId, setDupId] = useState<string | null>(null);
  const [accId, setAccId] = useState<string | null>(null);

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

  const accepter = (d: DevisRow) => {
    setAccId(d.id);
    start(async () => {
      const r = await marquerDevisAccepte(leadId, d.id);
      setAccId(null);
      if (r.ok) {
        toast.success(`Devis ${d.numero ?? ""} marqué signé`, {
          description: "Il fixe le montant de la commande et la base de facturation.",
        });
        router.refresh();
      } else toast.error(r.error ?? "Échec");
    });
  };

  return (
    <div className="space-y-4">
      {devisExistants.length > 0 ? (
        <ul className="divide-y divide-border">
          {devisExistants.map((d) => (
            <li
              key={d.id}
              className={cn(
                "flex flex-wrap items-center gap-3 py-2 text-sm",
                d.accepte && "-mx-2 rounded-lg bg-green-50 px-2",
              )}
            >
              <FileText className="size-4 text-muted-foreground" />
              <span className="font-medium text-foreground">{d.numero ?? "Devis"}</span>
              <span className="tabular-nums text-muted-foreground">
                {d.montantTtc ? (
                  <>
                    {formatEurosCents(d.montantTtc)} TTC
                    <span className="ml-1 text-xs">({formatEurosCents(d.montant)} HT)</span>
                  </>
                ) : (
                  <>{formatEurosCents(d.montant)} HT</>
                )}
              </span>
              {d.accepte ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-green-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  <BadgeCheck className="size-3" /> Signé
                </span>
              ) : d.statut ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {d.statut}
                </span>
              ) : null}
              <span className="ml-auto flex flex-wrap items-center gap-3">
                {!d.accepte ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => accepter(d)}
                    className={cn(
                      "inline-flex items-center gap-1 text-xs font-medium hover:underline disabled:opacity-50",
                      choixRequis
                        ? "rounded-md bg-amber-600 px-2 py-1 text-white hover:no-underline"
                        : "text-green-700",
                    )}
                    title="Le client a signé CE devis : il devient la base du montant et de la facturation"
                  >
                    {pending && accId === d.id ? (
                      <RefreshCw className="size-3.5 animate-spin" />
                    ) : (
                      <BadgeCheck className="size-3.5" />
                    )}
                    Marquer signé
                  </button>
                ) : null}
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
