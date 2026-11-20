"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardCheck, MessageSquareWarning, Send, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatHorodatage, tempsRelatif } from "@/lib/format";
import type { PointValidation, Reponses, StatutValidation } from "@/lib/chantier-validation";
import { resumeDetails, type DetailsClient } from "@/lib/schema-production";
import { annulerValidation, demanderValidation } from "./validation-actions";

export type ValidationDTO = {
  statut: StatutValidation;
  demandeeAt: string;
  reponduAt: string | null;
  ip: string | null;
  points: PointValidation[];
  reponses: Reponses | null;
  details: DetailsClient | null;
};

const BTN =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50";

// Suivi de la validation du chantier par le client (dans le bloc Espace client).
export function ValidationChantier({
  leadId,
  validation,
  metreSaisi,
}: {
  leadId: string;
  validation: ValidationDTO | null;
  metreSaisi: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmRetrait, setConfirmRetrait] = useState(false);

  function demander() {
    start(async () => {
      const r = await demanderValidation(leadId);
      if (!r.ok) return void toast.error(r.error ?? "Échec");
      const url = `${window.location.origin}/espace/${r.jeton}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Validation demandée — lien de l'espace client copié, envoie-le au client");
      } catch {
        toast.success("Validation demandée — envoie le lien de l'espace client au client");
      }
      router.refresh();
    });
  }

  function retirer() {
    start(async () => {
      const r = await annulerValidation(leadId);
      if (!r.ok) return void toast.error(r.error ?? "Échec");
      setConfirmRetrait(false);
      toast.success("Demande retirée");
      router.refresh();
    });
  }

  const boutonDemander = (libelle: string) => (
    <button type="button" className={BTN} onClick={demander} disabled={pending || !metreSaisi}>
      <Send className="size-3.5" /> {libelle}
    </button>
  );

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="text-eyebrow flex items-center gap-1.5 text-muted-foreground">
        <ClipboardCheck className="size-3.5" /> Schéma de production à faire valider
      </div>

      {!validation ? (
        <>
          <p className="text-xs text-muted-foreground">
            Le client reçoit dans son espace le schéma de sa pergola (vue 3D, fermetures par
            côté) avec l&apos;adresse, le métré, la pose, le modèle, les équipements et les
            documents « À faire valider » ; il précise le côté maison, les lames, le sol et
            peut joindre des photos, puis donne son accord.
          </p>
          {boutonDemander("Demander la validation")}
          {!metreSaisi ? (
            <p className="text-xs text-amber-700">Saisis d&apos;abord le métré (bloc Métré).</p>
          ) : null}
        </>
      ) : validation.statut === "demandee" ? (
        <>
          <p className="text-sm">
            <span className="font-semibold text-amber-700">En attente du client</span>
            <span className="text-muted-foreground">
              {" "}· demandée {tempsRelatif(validation.demandeeAt)} · {validation.points.length} points
            </span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {boutonDemander("Mettre à jour la demande")}
            <button type="button" className={BTN} onClick={() => setConfirmRetrait(true)} disabled={pending}>
              <Undo2 className="size-3.5" /> Retirer
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            « Mettre à jour » reprend le métré et les documents actuels.
          </p>
        </>
      ) : (
        <>
          {validation.statut === "validee" ? (
            <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
              <CheckCircle2 className="size-4" /> Validé par le client le{" "}
              {formatHorodatage(validation.reponduAt)}
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-700">
              <MessageSquareWarning className="size-4" /> Corrections demandées le{" "}
              {formatHorodatage(validation.reponduAt)}
            </p>
          )}
          <ul className="space-y-1.5">
            {validation.points.map((p) => {
              const r = validation.reponses?.[p.cle];
              return (
                <li key={p.cle} className="text-xs">
                  <span className={r?.ok === false ? "font-semibold text-amber-800" : "text-foreground"}>
                    {r?.ok === false ? "✗" : "✓"} {p.titre}
                    {p.documentNom ? ` — ${p.documentNom}` : ""}
                  </span>
                  {r?.commentaire ? (
                    <div className="ml-3 whitespace-pre-line rounded bg-amber-50 px-2 py-1 text-amber-900">
                      « {r.commentaire} »
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {validation.details && resumeDetails(validation.details).length ? (
            <div className="rounded bg-slate-50 px-2 py-1.5 text-xs">
              <p className="font-semibold">Précisions du client</p>
              <ul className="mt-0.5 space-y-0.5">
                {resumeDetails(validation.details).map((l) => (
                  <li key={l}>· {l}</li>
                ))}
              </ul>
              {validation.details.photos.length ? (
                <p className="mt-1 text-muted-foreground">Photos : bloc Documents (« Photo client — … »).</p>
              ) : null}
            </div>
          ) : null}
          {validation.ip ? (
            <p className="text-[11px] text-muted-foreground">Réponse enregistrée depuis l&apos;adresse IP {validation.ip}</p>
          ) : null}
          {boutonDemander("Nouvelle demande")}
        </>
      )}

      <ConfirmDialog
        open={confirmRetrait}
        titre="Retirer la demande de validation ?"
        description="Le formulaire disparaît de l'espace client. Tu pourras refaire une demande à tout moment."
        confirmLabel="Retirer"
        pending={pending}
        onConfirm={retirer}
        onCancel={() => !pending && setConfirmRetrait(false)}
      />
    </div>
  );
}
