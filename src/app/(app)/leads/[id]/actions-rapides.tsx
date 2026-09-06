"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  PhoneOff,
  Phone,
  CalendarPlus,
  RefreshCw,
  FilePen,
  CalendarX,
  Check,
  X,
  Loader2,
  Mail,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ymdParis } from "@/lib/format";
import { logActivite } from "./actions";
import { pasDeReponse, fixerRdv, rdvAReprogrammer, devisAEnvoyer } from "./prospect-actions";

type Panel = "pas_de_reponse" | "rdv" | "relance" | "reprog" | null;

const plusJours = (n: number) => ymdParis(new Date(Date.now() + n * 86400000));

// Les gestes de la prospection, à UN clic, depuis la fiche : pas de réponse,
// RDV fixé, relance, devis à envoyer, appel passé, email. Chaque geste
// journalise + met la fiche à jour + déplace l'étape quand c'est pertinent.
export function ActionsRapides({
  leadId,
  rdv,
  onEmail,
}: {
  leadId: string;
  rdv: { date: string | null; heure: string | null; type: string | null; statut: string | null };
  /** Ouvre le composeur d'email (géré par le parent). */
  onEmail?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [panel, setPanel] = useState<Panel>(null);
  const [relance, setRelance] = useState(plusJours(2));
  const [rdvDate, setRdvDate] = useState(rdv.date ?? plusJours(3));
  const [rdvHeure, setRdvHeure] = useState(rdv.heure ?? "");
  const [rdvType, setRdvType] = useState<"physique" | "visio">(
    rdv.type === "visio" ? "visio" : "physique",
  );
  const [motif, setMotif] = useState("");

  const run = (fn: () => Promise<{ ok: boolean; error?: string | null } | void>, ok: string) =>
    start(async () => {
      try {
        const r = await fn();
        if (r && !r.ok) {
          toast.error(r.error ?? "Échec");
          return;
        }
        toast.success(ok);
        setPanel(null);
        router.refresh();
      } catch {
        toast.error("Échec");
      }
    });

  const btn =
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={pending}
          onClick={() => setPanel(panel === "pas_de_reponse" ? null : "pas_de_reponse")}
          className={cn(
            btn,
            panel === "pas_de_reponse"
              ? "border-slate-400 bg-slate-100 text-slate-800"
              : "border-border bg-white text-foreground hover:border-slate-400 hover:bg-slate-50",
          )}
        >
          <PhoneOff className="size-3.5 text-slate-500" /> Pas de réponse
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => logActivite(leadId, "appel"), "Appel enregistré")}
          className={cn(btn, "border-border bg-white text-foreground hover:border-blue-300 hover:bg-blue-50")}
        >
          <Phone className="size-3.5 text-blue-600" /> Appel passé
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setPanel(panel === "rdv" ? null : "rdv")}
          className={cn(
            btn,
            panel === "rdv"
              ? "border-blue-500 bg-blue-600 text-white"
              : "border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100",
          )}
        >
          <CalendarPlus className="size-3.5" /> {rdv.date ? "Modifier le RDV" : "RDV fixé"}
        </button>
        {rdv.date && rdv.statut !== "a_reprogrammer" ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => setPanel(panel === "reprog" ? null : "reprog")}
            className={cn(btn, "border-border bg-white text-foreground hover:border-amber-300 hover:bg-amber-50")}
          >
            <CalendarX className="size-3.5 text-amber-600" /> RDV à reprogrammer
          </button>
        ) : null}
        <button
          type="button"
          disabled={pending}
          onClick={() => setPanel(panel === "relance" ? null : "relance")}
          className={cn(
            btn,
            panel === "relance"
              ? "border-orange-500 bg-orange-500 text-white"
              : "border-orange-300 bg-orange-50 text-orange-800 hover:bg-orange-100",
          )}
        >
          <RefreshCw className="size-3.5" /> Relance
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => devisAEnvoyer(leadId), "Fiche en « Devis à envoyer »")}
          className={cn(btn, "border-border bg-white text-foreground hover:border-cyan-300 hover:bg-cyan-50")}
        >
          <FilePen className="size-3.5 text-cyan-700" /> Devis à envoyer
        </button>
        {onEmail ? (
          <button
            type="button"
            disabled={pending}
            onClick={onEmail}
            className={cn(btn, "border-border bg-white text-foreground hover:border-violet-300 hover:bg-violet-50")}
          >
            <Mail className="size-3.5 text-violet-600" /> Email
          </button>
        ) : null}
      </div>

      {panel === "pas_de_reponse" ? (
        <Panneau
          titre="Pas de réponse — quand rappeler ?"
          onCancel={() => setPanel(null)}
          onConfirm={() => run(() => pasDeReponse(leadId, relance || null), "Tentative notée, relance programmée")}
          pending={pending}
          confirmLabel="Noter et programmer"
        >
          <div className="flex flex-wrap items-center gap-2">
            {[
              { l: "Demain", d: plusJours(1) },
              { l: "Dans 2 j", d: plusJours(2) },
              { l: "Dans 1 sem.", d: plusJours(7) },
            ].map((o) => (
              <button
                key={o.d}
                type="button"
                onClick={() => setRelance(o.d)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs",
                  relance === o.d ? "border-primary bg-primary/10 text-primary" : "border-border bg-white",
                )}
              >
                {o.l}
              </button>
            ))}
            <input
              type="date"
              value={relance}
              onChange={(e) => setRelance(e.target.value)}
              className="h-8 rounded-md border border-border bg-white px-2 text-sm"
            />
          </div>
        </Panneau>
      ) : null}

      {panel === "rdv" ? (
        <Panneau
          titre="Rendez-vous"
          onCancel={() => setPanel(null)}
          onConfirm={() =>
            run(
              async () => {
                const r = await fixerRdv(leadId, { date: rdvDate, heure: rdvHeure || null, type: rdvType });
                if (r.ok && !r.agenda)
                  toast.message("RDV enregistré", { description: "Agenda Google non synchronisé (compte / scope absent)." });
                return r;
              },
              "RDV fixé — invitation envoyée au client",
            )
          }
          pending={pending}
          confirmLabel="Fixer le RDV"
          disabled={!rdvDate}
        >
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={rdvDate}
              onChange={(e) => setRdvDate(e.target.value)}
              className="h-8 rounded-md border border-border bg-white px-2 text-sm"
            />
            <input
              type="time"
              value={rdvHeure}
              onChange={(e) => setRdvHeure(e.target.value)}
              className="h-8 rounded-md border border-border bg-white px-2 text-sm"
              title="Heure (vide = journée entière)"
            />
            <div className="inline-flex rounded-md border border-border bg-white p-0.5 text-xs">
              {(["physique", "visio"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setRdvType(t)}
                  className={cn(
                    "rounded px-2.5 py-1 font-medium",
                    rdvType === t ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  {t === "physique" ? "Physique" : "Visio"}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-muted-foreground">
              → étape « Rendez-vous » + Google Agenda (client invité)
            </span>
          </div>
        </Panneau>
      ) : null}

      {panel === "reprog" ? (
        <Panneau
          titre="RDV à reprogrammer — pourquoi ?"
          onCancel={() => setPanel(null)}
          onConfirm={() => run(() => rdvAReprogrammer(leadId, motif), "RDV marqué à reprogrammer")}
          pending={pending}
          confirmLabel="Confirmer"
        >
          <input
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="ex. client absent, a demandé à décaler…"
            className="h-8 w-full rounded-md border border-border bg-white px-2 text-sm"
          />
        </Panneau>
      ) : null}

      {panel === "relance" ? (
        <Panneau
          titre="Relance effectuée — prochaine relance"
          onCancel={() => setPanel(null)}
          onConfirm={() =>
            run(() => logActivite(leadId, "relance", { nextRelanceDate: relance }), "Relance enregistrée")
          }
          pending={pending}
          confirmLabel="Enregistrer la relance"
        >
          <div className="flex flex-wrap items-center gap-2">
            {[
              { l: "Dans 2 j", d: plusJours(2) },
              { l: "Dans 1 sem.", d: plusJours(7) },
              { l: "Dans 2 sem.", d: plusJours(14) },
            ].map((o) => (
              <button
                key={o.d}
                type="button"
                onClick={() => setRelance(o.d)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs",
                  relance === o.d ? "border-primary bg-primary/10 text-primary" : "border-border bg-white",
                )}
              >
                {o.l}
              </button>
            ))}
            <input
              type="date"
              value={relance}
              onChange={(e) => setRelance(e.target.value)}
              className="h-8 rounded-md border border-border bg-white px-2 text-sm"
            />
          </div>
        </Panneau>
      ) : null}
    </div>
  );
}

function Panneau({
  titre,
  children,
  onCancel,
  onConfirm,
  pending,
  confirmLabel,
  disabled,
}: {
  titre: string;
  children: React.ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
  confirmLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/[0.04] p-3">
      <div className="text-xs font-semibold text-foreground">{titre}</div>
      {children}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending || disabled}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" /> Annuler
        </button>
      </div>
    </div>
  );
}
