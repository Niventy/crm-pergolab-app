"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, Check, Circle, CircleDot } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatEurosCents, formatDate, todayParis } from "@/lib/format";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { addPaiement, deletePaiement } from "./paiements-actions";
import { MODES_PAIEMENT } from "./paiements-meta";

export type PaiementItem = {
  id: string;
  date: string;
  montant: number;
  mode: string;
  reference: string | null;
  auteur: string | null;
};

const modeLabel = (m: string) => MODES_PAIEMENT.find((x) => x.value === m)?.label ?? m;

export function Paiements({
  leadId,
  paiements,
  ttc,
  echeancier,
}: {
  leadId: string;
  paiements: PaiementItem[];
  /** TTC de la commande (devis accepté ou saisi) ; null = inconnu. */
  ttc: number | null;
  /** Échéancier du devis (% : acompte / livraison / solde). */
  echeancier: [number, number, number];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayParis());
  const [montant, setMontant] = useState("");
  const [mode, setMode] = useState("virement");
  const [reference, setReference] = useState("");
  const [aSupprimer, setASupprimer] = useState<PaiementItem | null>(null);

  const encaisse = paiements.reduce((a, p) => a + p.montant, 0);
  const reste = ttc == null ? null : Math.max(0, ttc - encaisse);

  // Échéancier attendu (cumulé) vs reçu : pré-remplit le prochain palier.
  const paliers = ["Acompte", "Livraison", "Solde"].map((label, i) => {
    const pct = echeancier[i] ?? 0;
    const montantPalier = ttc == null ? null : (ttc * pct) / 100;
    const cumulAttendu =
      ttc == null ? null : (ttc * echeancier.slice(0, i + 1).reduce((a, b) => a + b, 0)) / 100;
    const etat: "fait" | "partiel" | "a_venir" =
      cumulAttendu == null
        ? "a_venir"
        : encaisse >= cumulAttendu - 0.5
          ? "fait"
          : i === 0 || encaisse >= (ttc! * echeancier.slice(0, i).reduce((a, b) => a + b, 0)) / 100 - 0.5
            ? "partiel"
            : "a_venir";
    return { label, pct, montantPalier, cumulAttendu, etat };
  });
  const prochain = paliers.find((p) => p.etat !== "fait");

  function ouvrirAjout() {
    setDate(todayParis());
    setMontant(
      prochain?.cumulAttendu != null
        ? String(Math.max(0, Math.round((prochain.cumulAttendu - encaisse) * 100) / 100))
        : "",
    );
    setOpen(true);
  }

  function ajouter() {
    start(async () => {
      const r = await addPaiement(leadId, { date, montant, mode, reference });
      if (r.ok) {
        toast.success("Paiement enregistré");
        setOpen(false);
        setMontant("");
        setReference("");
        router.refresh();
      } else toast.error(r.error ?? "Échec");
    });
  }

  function supprimer() {
    if (!aSupprimer) return;
    start(async () => {
      const r = await deletePaiement(leadId, aSupprimer.id);
      setASupprimer(null);
      if (r.ok) {
        toast.success("Paiement supprimé");
        router.refresh();
      } else toast.error(r.error ?? "Échec");
    });
  }

  return (
    <div className="space-y-3">
      {/* Échéancier : attendu vs reçu */}
      {ttc != null ? (
        <ol className="grid grid-cols-3 gap-2">
          {paliers.map((p) => (
            <li
              key={p.label}
              className={cn(
                "rounded-lg border px-2.5 py-2 text-xs",
                p.etat === "fait"
                  ? "border-green-200 bg-green-50 text-green-800"
                  : p.etat === "partiel"
                    ? "border-orange-200 bg-orange-50 text-orange-800"
                    : "border-border bg-muted/30 text-muted-foreground",
              )}
            >
              <div className="flex items-center gap-1 font-semibold">
                {p.etat === "fait" ? (
                  <Check className="size-3.5" />
                ) : p.etat === "partiel" ? (
                  <CircleDot className="size-3.5" />
                ) : (
                  <Circle className="size-3.5" />
                )}
                {p.label} {p.pct} %
              </div>
              <div className="mt-0.5 tabular-nums">
                {p.montantPalier != null ? formatEurosCents(p.montantPalier) : "—"}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          TTC inconnu : marque le devis signé (ou saisis le TTC dans le dossier) pour
          suivre l&apos;échéancier.
        </p>
      )}

      {/* Totaux */}
      <div className="flex flex-wrap gap-4 rounded-lg bg-muted/40 px-3 py-2 text-sm">
        <span className="text-muted-foreground">
          Encaissé :{" "}
          <span className="font-semibold tabular-nums text-green-700">
            {formatEurosCents(encaisse)}
          </span>
        </span>
        <span className="text-muted-foreground">
          Reste à encaisser :{" "}
          <span className="font-semibold tabular-nums text-orange-700">
            {reste == null ? "TTC inconnu" : formatEurosCents(reste)}
          </span>
        </span>
        {ttc != null ? (
          <span className="text-xs text-muted-foreground">(TTC {formatEurosCents(ttc)})</span>
        ) : null}
      </div>

      {/* Historique */}
      {paiements.length > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {paiements.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="w-20 shrink-0 tabular-nums text-muted-foreground">
                {formatDate(p.date)}
              </span>
              <span className="font-semibold tabular-nums text-foreground">
                {formatEurosCents(p.montant)}
              </span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                {modeLabel(p.mode)}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {p.reference ?? ""}
                {p.auteur ? ` · ${p.auteur}` : ""}
              </span>
              <button
                type="button"
                onClick={() => setASupprimer(p)}
                disabled={pending}
                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                aria-label="Supprimer le paiement"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Aucun paiement enregistré.</p>
      )}

      {/* Ajout */}
      {open ? (
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-primary/30 bg-primary/[0.03] p-3 sm:grid-cols-[8rem_8rem_1fr_1fr_auto] sm:items-end">
          <label className="block text-[0.65rem] uppercase tracking-wide text-muted-foreground">
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-0.5 h-9 w-full rounded-md border border-border bg-white px-2 text-sm normal-case text-foreground outline-none focus:border-primary"
            />
          </label>
          <label className="block text-[0.65rem] uppercase tracking-wide text-muted-foreground">
            Montant TTC
            <input
              type="text"
              inputMode="decimal"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              placeholder="0,00"
              className="mt-0.5 h-9 w-full rounded-md border border-border bg-white px-2 text-right text-sm normal-case text-foreground outline-none focus:border-primary"
            />
          </label>
          <label className="block text-[0.65rem] uppercase tracking-wide text-muted-foreground">
            Mode
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="mt-0.5 h-9 w-full rounded-md border border-border bg-white px-2 text-sm normal-case text-foreground outline-none focus:border-primary"
            >
              {MODES_PAIEMENT.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[0.65rem] uppercase tracking-wide text-muted-foreground">
            Référence
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="n° chèque, virement…"
              className="mt-0.5 h-9 w-full rounded-md border border-border bg-white px-2 text-sm normal-case text-foreground outline-none focus:border-primary"
            />
          </label>
          <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
            <button
              type="button"
              onClick={ajouter}
              disabled={pending || !montant}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Enregistrer
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={ouvrirAjout}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-semibold text-foreground hover:bg-muted"
        >
          <Plus className="size-4" />
          Ajouter un paiement
          {prochain?.cumulAttendu != null && prochain.cumulAttendu - encaisse > 0.5 ? (
            <span className="text-xs font-normal text-muted-foreground">
              · {prochain.label} attendu {formatEurosCents(prochain.cumulAttendu - encaisse)}
            </span>
          ) : null}
        </button>
      )}

      <ConfirmDialog
        open={aSupprimer !== null}
        titre={`Supprimer le paiement de ${aSupprimer ? formatEurosCents(aSupprimer.montant) : ""} ?`}
        description="Les totaux encaissés seront recalculés. L'opération est tracée dans l'activité."
        confirmLabel="Supprimer"
        danger
        pending={pending}
        onConfirm={supprimer}
        onCancel={() => setASupprimer(null)}
      />
    </div>
  );
}
