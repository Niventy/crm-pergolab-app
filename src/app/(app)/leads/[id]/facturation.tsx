"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, Loader2, ExternalLink, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatEurosCents } from "@/lib/format";
import { tauxLabel } from "@/lib/devis-calc";
import { ouvrirDans } from "@/lib/ouvrir-dans";
import type { EtatFacturation } from "@/lib/facturation";
import {
  creerFactureAcompte,
  creerFactureSolde,
  facturePdfUrl,
  synchroniserFacturation,
} from "./facturation-actions";

const TYPE_LABEL: Record<string, string> = {
  acompte: "Acompte",
  solde: "Solde",
  finale: "Facture",
};

// Statuts Pennylane → libellés lisibles (l'ADV ne doit pas lire « draft »).
const STATUT_LABEL: Record<string, { label: string; cls: string }> = {
  draft: { label: "Brouillon", cls: "bg-amber-100 text-amber-800" },
  finalized: { label: "Validée", cls: "bg-green-100 text-green-700" },
  paid: { label: "Payée", cls: "bg-green-600 text-white" },
  supprimee: { label: "Supprimée", cls: "bg-slate-100 text-slate-500" },
  cancelled: { label: "Annulée", cls: "bg-slate-100 text-slate-500" },
};

const eur = formatEurosCents;

export function Facturation({
  leadId,
  etat,
  pennylaneConfigured,
}: {
  leadId: string;
  etat: EtatFacturation;
  pennylaneConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const ref = etat.devisRef;
  const [pctA] = etat.echeancier;
  // Acompte saisi en TTC (= ce que le client paie), pré-rempli au 1er palier
  // de l'échéancier annoncé sur le devis.
  const [acompte, setAcompte] = useState<string>(() =>
    ref && etat.resteTtc > 0 && etat.ttcFacture === 0
      ? String(Math.round((ref.ttc * pctA) / 100))
      : "",
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
        setAcompte("");
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

  function sync() {
    start(async () => {
      const r = await synchroniserFacturation(leadId);
      if (r.ok) toast.success("Factures synchronisées avec Pennylane");
      else toast.error(r.error ?? "Synchronisation impossible");
      router.refresh();
    });
  }

  function ouvrirPdf(externalId: string) {
    setBusy(externalId);
    ouvrirDans(() => facturePdfUrl(externalId), () => setBusy(null));
  }

  const presets = etat.echeancier.map((p, i) => ({
    pct: p,
    label: ["Acompte", "Livraison", "Solde"][i] ?? `Palier ${i + 1}`,
  }));

  return (
    <div className="space-y-4">
      {/* Devis de référence */}
      {ref ? (
        <div className="space-y-1 rounded-lg bg-muted/40 px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="text-muted-foreground">
              Devis {ref.numero ? `N° ${ref.numero}` : ""} :{" "}
              <span className="font-semibold tabular-nums text-foreground">{eur(ref.ttc)} TTC</span>
              <span className="ml-1 text-xs">({eur(ref.ht)} HT)</span>
            </span>
            <span className="text-muted-foreground">
              Déjà facturé :{" "}
              <span className="font-semibold tabular-nums text-foreground">{eur(etat.ttcFacture)}</span>
            </span>
            <span className="text-muted-foreground">
              Reste à facturer :{" "}
              <span className="font-semibold tabular-nums text-orange-700">{eur(etat.resteTtc)}</span>
            </span>
            <button
              type="button"
              onClick={sync}
              disabled={pending}
              className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              title="Relit les statuts des factures dans Pennylane"
            >
              <RefreshCw className={cn("size-3.5", pending && "animate-spin")} /> Synchroniser
            </button>
          </div>
          <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            <span>TVA du devis :</span>
            {ref.parTaux.map((x) => (
              <span key={x.taux} className="tabular-nums">
                {tauxLabel(x.taux)} sur {eur(x.ht)} HT
              </span>
            ))}
            {!ref.accepte ? (
              <span className="text-amber-700">
                · devis unique pris par défaut (non marqué « signé »)
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {etat.raison === "choix"
            ? "Plusieurs devis sur cette fiche : marque le devis signé dans la section Devis pour pouvoir facturer."
            : "Aucun devis : crée le devis (section Devis) avant de facturer."}
        </div>
      )}

      {etat.syncError ? (
        <p className="text-xs text-amber-700">
          Synchronisation Pennylane partielle : {etat.syncError}
        </p>
      ) : null}

      {/* Factures existantes */}
      {etat.factures.length > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {etat.factures.map((f) => {
            const s = f.statut ? STATUT_LABEL[f.statut] : null;
            const supprimee = f.statut === "supprimee" || f.statut === "cancelled";
            return (
              <li
                key={f.id}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 text-sm",
                  supprimee && "opacity-60",
                )}
              >
                <FileText className="size-4 text-muted-foreground" />
                <span className="flex-1">
                  <span className={cn("font-medium text-foreground", supprimee && "line-through")}>
                    {TYPE_LABEL[f.type] ?? f.type}
                  </span>
                  <span className="ml-2 text-muted-foreground">
                    {f.numero} · <span className="tabular-nums">{eur(f.montantTtc)} TTC</span>
                    <span className="ml-1 text-xs">({eur(f.montantHt)} HT)</span>
                  </span>
                  {s ? (
                    <span
                      className={cn(
                        "ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        s.cls,
                      )}
                    >
                      {s.label}
                    </span>
                  ) : null}
                </span>
                {f.externalId && !supprimee ? (
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
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          Aucune facture. Crée la facture d&apos;acompte puis, à l&apos;installation,
          la facture de solde. (Créées en brouillon dans Pennylane, à valider.)
        </p>
      )}

      {/* Actions */}
      {ref && etat.resteTtc > 0 ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Échéancier du devis :</span>
            {presets.map((p) => {
              const m = Math.round((ref.ttc * p.pct) / 100);
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setAcompte(String(m))}
                  className="rounded-full border border-border bg-white px-2.5 py-1 font-medium text-foreground hover:border-primary/40 hover:bg-primary/5"
                  title={`${p.pct} % du TTC`}
                >
                  {p.label} {p.pct} % · {eur(m)}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                Montant TTC de l&apos;acompte
              </span>
              <div className="flex items-center rounded-md border border-border bg-white px-2">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={acompte}
                  onChange={(e) => setAcompte(e.target.value)}
                  className="h-9 w-32 bg-transparent text-right text-sm outline-none"
                />
                <span className="pl-1 text-xs text-muted-foreground">€ TTC</span>
              </div>
            </label>
            <button
              type="button"
              onClick={acompteAction}
              disabled={pending || !acompte}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Facture d&apos;acompte
            </button>
            <button
              type="button"
              onClick={soldeAction}
              disabled={pending}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              title="Facture tout le reste, taux par taux, avec rappel des acomptes"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
              Facture de solde ({eur(etat.resteTtc)})
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            La TVA de chaque facture reprend celle du devis (une ligne par taux) :
            le TTC facturé correspond exactement au TTC signé.
          </p>
        </div>
      ) : ref ? (
        <p className="text-xs font-medium text-green-700">Devis entièrement facturé.</p>
      ) : null}
    </div>
  );
}
