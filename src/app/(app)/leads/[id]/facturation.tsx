"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { formatEuros } from "@/lib/format";
import {
  creerFactureAcompte,
  creerFactureSolde,
  facturePdfUrl,
} from "./facturation-actions";

export type FactureItem = {
  id: string;
  type: string;
  numero: string | null;
  externalId: string | null;
  montantHt: number | null;
  statut: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  acompte: "Acompte",
  solde: "Solde",
  finale: "Facture",
};

const eur = (n: number) => formatEuros(String(Math.round(n * 100) / 100));

export function Facturation({
  leadId,
  factures,
  montantHt,
  pennylaneConfigured,
}: {
  leadId: string;
  factures: FactureItem[];
  montantHt: number;
  pennylaneConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const dejaFacture = factures.reduce((a, f) => a + (f.montantHt ?? 0), 0);
  const resteHt = Math.max(0, Math.round((montantHt - dejaFacture) * 100) / 100);
  const [acompte, setAcompte] = useState<string>(() =>
    montantHt > 0 ? String(Math.round(montantHt * 0.4)) : "",
  );

  if (!pennylaneConfigured) {
    return (
      <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Pennylane n&apos;est pas configuré (<code>PENNYLANE_API_KEY</code>) — la
        facturation sera disponible en production.
      </p>
    );
  }

  function acompteAction() {
    const m = Number(acompte.replace(",", "."));
    if (!(m > 0)) return toast.error("Montant d'acompte invalide.");
    start(async () => {
      const r = await creerFactureAcompte(leadId, m);
      if (r.ok) {
        toast.success(`Facture d'acompte ${r.numero ?? ""} créée (brouillon)`);
        router.refresh();
      } else toast.error(r.error ?? "Échec");
    });
  }

  function soldeAction() {
    start(async () => {
      const r = await creerFactureSolde(leadId);
      if (r.ok) {
        toast.success(`Facture de solde ${r.numero ?? ""} créée (brouillon)`);
        router.refresh();
      } else toast.error(r.error ?? "Échec");
    });
  }

  function ouvrirPdf(externalId: string) {
    const w = window.open("", "_blank");
    setBusy(externalId);
    facturePdfUrl(externalId).then((r) => {
      setBusy(null);
      if (r.ok && r.url && w) w.location.href = r.url;
      else {
        if (w) w.close();
        toast.error(r.error ?? "PDF indisponible");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Récap montant */}
      <div className="flex flex-wrap gap-4 rounded-lg bg-muted/40 px-3 py-2 text-sm">
        <span className="text-muted-foreground">
          Commande HT :{" "}
          <span className="font-semibold tabular-nums text-foreground">{eur(montantHt)}</span>
        </span>
        <span className="text-muted-foreground">
          Déjà facturé :{" "}
          <span className="font-semibold tabular-nums text-foreground">{eur(dejaFacture)}</span>
        </span>
        <span className="text-muted-foreground">
          Reste à facturer :{" "}
          <span className="font-semibold tabular-nums text-orange-700">{eur(resteHt)}</span>
        </span>
      </div>

      {/* Factures existantes */}
      {factures.length > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {factures.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <FileText className="size-4 text-muted-foreground" />
              <span className="flex-1">
                <span className="font-medium text-foreground">
                  {TYPE_LABEL[f.type] ?? f.type}
                </span>
                <span className="ml-2 text-muted-foreground">
                  {f.numero} · {eur(f.montantHt ?? 0)} HT
                </span>
                {f.statut ? (
                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                    {f.statut}
                  </span>
                ) : null}
              </span>
              {f.externalId ? (
                <button
                  type="button"
                  onClick={() => ouvrirPdf(f.externalId!)}
                  disabled={busy === f.externalId}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                >
                  {busy === f.externalId ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <ExternalLink className="size-3.5" />
                  )}
                  PDF
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          Aucune facture. Crée la facture d&apos;acompte puis, à l&apos;installation,
          la facture de solde. (Créées en brouillon dans Pennylane, à valider.)
        </p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
            Montant HT de l&apos;acompte
          </span>
          <div className="flex items-center rounded-md border border-border bg-white px-2">
            <input
              type="number"
              min={0}
              step="1"
              value={acompte}
              onChange={(e) => setAcompte(e.target.value)}
              className="h-9 w-28 bg-transparent text-right text-sm outline-none"
            />
            <span className="pl-1 text-xs text-muted-foreground">€</span>
          </div>
        </label>
        <button
          type="button"
          onClick={acompteAction}
          disabled={pending}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Facture d&apos;acompte
        </button>
        <button
          type="button"
          onClick={soldeAction}
          disabled={pending || resteHt <= 0}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          title={resteHt <= 0 ? "Déjà entièrement facturé" : undefined}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
          Facture de solde ({eur(resteHt)})
        </button>
      </div>
    </div>
  );
}
