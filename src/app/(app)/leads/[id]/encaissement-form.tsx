"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, CircleCheck } from "lucide-react";
import { toast } from "sonner";
import { formatEuros } from "@/lib/format";
import { saveEncaissement } from "./actions";

type Props = {
  leadId: string;
  montantHt: number | null;
  montantTtc: string | null;
  acompteEncaisse: string | null;
  paiementEspece: string | null;
  financeur: string | null;
  equipePose: string | null;
  mesure: string | null;
  factureSoldeClient: boolean;
  factureSoldePoseur: boolean;
  dossierDateEnvoi: string | null;
};

const n = (v: string) => {
  const t = v.trim().replace(",", ".");
  const x = Number(t);
  return t !== "" && Number.isFinite(x) ? x : 0;
};

export function EncaissementForm(p: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ttc, setTtc] = useState(p.montantTtc ?? "");
  const [acompte, setAcompte] = useState(p.acompteEncaisse ?? "");
  const [espece, setEspece] = useState(p.paiementEspece ?? "");
  const [financeur, setFinanceur] = useState(p.financeur ?? "");
  const [equipe, setEquipe] = useState(p.equipePose ?? "");
  const [mesure, setMesure] = useState(p.mesure ?? "");
  const [factClient, setFactClient] = useState(p.factureSoldeClient);
  const [factPoseur, setFactPoseur] = useState(p.factureSoldePoseur);
  const [envoi, setEnvoi] = useState(p.dossierDateEnvoi ?? "");

  const base = n(ttc) || p.montantHt || 0;
  const encaisse = n(acompte) + n(espece);
  const reste = Math.max(0, base - encaisse);
  const dossierComplet = factClient && factPoseur && envoi.trim() !== "";

  function enregistrer() {
    start(async () => {
      const r = await saveEncaissement(p.leadId, {
        montantTtc: ttc,
        acompteEncaisse: acompte,
        paiementEspece: espece,
        financeur,
        equipePose: equipe,
        mesure,
        factureSoldeClient: factClient,
        factureSoldePoseur: factPoseur,
        dossierDateEnvoi: envoi,
      });
      if (r.ok) {
        toast.success("Encaissement enregistré");
        router.refresh();
      } else toast.error("Échec de l'enregistrement");
    });
  }

  return (
    <div className="space-y-4">
      {/* Paiements */}
      <div>
        <div className="text-eyebrow mb-2 text-muted-foreground">Paiements</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Num label="Montant TTC" value={ttc} onChange={setTtc} />
          <Num label="Acompte encaissé" value={acompte} onChange={setAcompte} />
          <Num label="Paiement espèce" value={espece} onChange={setEspece} />
          <Txt label="Financeur (ex. SOFINCO)" value={financeur} onChange={setFinanceur} />
          <Txt label="Équipe de pose" value={equipe} onChange={setEquipe} />
          <Txt label="Mesure / kilo" value={mesure} onChange={setMesure} />
        </div>
        <div className="mt-3 flex flex-wrap gap-4 rounded-lg bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            Encaissé :{" "}
            <span className="font-semibold tabular-nums text-green-700">
              {formatEuros(encaisse)}
            </span>
          </span>
          <span className="text-muted-foreground">
            Reste à encaisser :{" "}
            <span className="font-semibold tabular-nums text-orange-700">
              {formatEuros(reste)}
            </span>
          </span>
          <span className="text-xs text-muted-foreground">
            (base {formatEuros(base)}
            {!n(ttc) && p.montantHt ? " — HT, saisis le TTC" : ""})
          </span>
        </div>
      </div>

      {/* Dossier administratif */}
      <div>
        <div className="text-eyebrow mb-2 flex items-center gap-2 text-muted-foreground">
          Dossier administratif
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
              onChange={(e) => setFactClient(e.target.checked)}
              className="size-4 accent-green-700"
            />
            Facture solde client
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={factPoseur}
              onChange={(e) => setFactPoseur(e.target.checked)}
              className="size-4 accent-green-700"
            />
            Facture solde poseur
          </label>
          <Txt label="Date d'envoi du dossier" value={envoi} onChange={setEnvoi} type="date" />
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

function Num({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center rounded-md border border-border bg-white px-2">
        <input
          type="number"
          min={0}
          step="0.01"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full bg-transparent text-right text-sm outline-none"
        />
        <span className="pl-1 text-xs text-muted-foreground">€</span>
      </div>
    </label>
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
