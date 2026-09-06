"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, CircleCheck } from "lucide-react";
import { toast } from "sonner";
import { formatEurosCents } from "@/lib/format";
import { saveEncaissement } from "./actions";

// Dossier administratif d'une commande : TTC (si aucun devis signé ne le
// fournit), financeur, métré, factures de solde, envoi du dossier. Les
// PAIEMENTS ont leur propre carte (historique) — plus de champ « acompte » ici.
export function DossierAdmin(p: {
  leadId: string;
  montantTtc: string | null;
  ttcDuDevis: number | null; // TTC du devis signé → le champ TTC devient lecture seule
  financeur: string | null;
  mesure: string | null;
  factureSoldeClient: boolean;
  factureSoldePoseur: boolean;
  dossierDateEnvoi: string | null;
  soldeFacture: boolean; // une facture de solde existe dans Pennylane
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ttc, setTtc] = useState(p.montantTtc ?? "");
  const [financeur, setFinanceur] = useState(p.financeur ?? "");
  const [mesure, setMesure] = useState(p.mesure ?? "");
  const [factClient, setFactClient] = useState(p.factureSoldeClient || p.soldeFacture);
  const [factPoseur, setFactPoseur] = useState(p.factureSoldePoseur);
  const [envoi, setEnvoi] = useState(p.dossierDateEnvoi ?? "");

  const dossierComplet = factClient && factPoseur && envoi.trim() !== "";

  function enregistrer() {
    start(async () => {
      const r = await saveEncaissement(p.leadId, {
        ...(p.ttcDuDevis == null ? { montantTtc: ttc } : {}),
        financeur,
        mesure,
        factureSoldeClient: factClient,
        factureSoldePoseur: factPoseur,
        dossierDateEnvoi: envoi,
      });
      if (r.ok) {
        toast.success("Dossier enregistré");
        router.refresh();
      } else toast.error("Échec de l'enregistrement");
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
            Montant TTC de la commande
          </span>
          {p.ttcDuDevis != null ? (
            <div
              className="flex h-9 items-center justify-end rounded-md border border-border bg-muted/40 px-2 text-sm tabular-nums text-foreground"
              title="Fixé par le devis signé"
            >
              {formatEurosCents(p.ttcDuDevis)}
            </div>
          ) : (
            <div className="flex items-center rounded-md border border-border bg-white px-2">
              <input
                type="text"
                inputMode="decimal"
                value={ttc}
                onChange={(e) => setTtc(e.target.value)}
                placeholder="à saisir"
                className="h-9 w-full bg-transparent text-right text-sm outline-none"
              />
              <span className="pl-1 text-xs text-muted-foreground">€</span>
            </div>
          )}
        </label>
        <Txt label="Financeur (ex. SOFINCO)" value={financeur} onChange={setFinanceur} />
        <Txt label="Métré (mesure / kilo)" value={mesure} onChange={setMesure} />
      </div>

      <div>
        <div className="text-eyebrow mb-2 flex items-center gap-2 text-muted-foreground">
          Clôture du dossier
          {dossierComplet ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green-700">
              <CircleCheck className="size-3" /> Complet
            </span>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={factClient}
              disabled={p.soldeFacture}
              onChange={(e) => setFactClient(e.target.checked)}
              className="size-4 accent-green-700"
            />
            Facture de solde client
            {p.soldeFacture ? (
              <span className="text-[10px] text-muted-foreground">(émise via Pennylane)</span>
            ) : null}
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={factPoseur}
              onChange={(e) => setFactPoseur(e.target.checked)}
              className="size-4 accent-green-700"
            />
            Facture du poseur reçue
          </label>
          <Txt label="Dossier envoyé le" value={envoi} onChange={setEnvoi} type="date" />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={enregistrer}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Enregistrer
        </button>
      </div>
    </div>
  );
}

function Txt({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-border bg-white px-2 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}
