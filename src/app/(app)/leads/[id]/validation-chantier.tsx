"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ClipboardCheck, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatHorodatage } from "@/lib/format";
import type { StatutValidation } from "@/lib/chantier-validation";
import { resumeDetails, type DetailsClient, type SchemaEnregistre } from "@/lib/schema-production";
import { rouvrirConfiguration } from "./validation-actions";

export type ValidationDTO = {
  statut: StatutValidation;
  reponduAt: string | null;
  ip: string | null;
  schema: SchemaEnregistre | null;
  details: DetailsClient | null;
};

const BTN =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50";

// Schéma de production configuré par le client dans son espace (configurateur
// ouvert d'office tant qu'il n'a pas validé). Écarts avec devis + métré en évidence.
export function ValidationChantier({ leadId, validation }: { leadId: string; validation: ValidationDTO | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmer, setConfirmer] = useState(false);
  const valide = validation?.statut === "validee" ? validation : null;

  function rouvrir() {
    start(async () => {
      const r = await rouvrirConfiguration(leadId);
      if (!r.ok) return void toast.error(r.error ?? "Échec");
      setConfirmer(false);
      toast.success("Configurateur rouvert dans l'espace client");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="text-eyebrow flex items-center gap-1.5 text-muted-foreground">
        <ClipboardCheck className="size-3.5" /> Schéma de production (configuré par le client)
      </div>

      {!valide ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-amber-700">En attente du client.</span> Son espace lui
          propose de reconfigurer sa pergola (pré-remplie depuis le devis signé et le métré), de
          préciser la pose puis de valider. Partage-lui le lien de l&apos;espace client.
        </p>
      ) : (
        <>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
            <CheckCircle2 className="size-4" /> Validé par le client le {formatHorodatage(valide.reponduAt)}
          </p>
          {valide.schema ? (
            <>
              <ul className="space-y-0.5 text-xs">
                {valide.schema.resume.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              {valide.schema.ecarts.length ? (
                <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                  <p className="flex items-center gap-1 font-semibold">
                    <AlertTriangle className="size-3.5" /> {valide.schema.ecarts.length} écart
                    {valide.schema.ecarts.length > 1 ? "s" : ""} avec le devis / métré
                  </p>
                  <ul className="mt-0.5 space-y-0.5">
                    {valide.schema.ecarts.map((e) => (
                      <li key={e}>· {e}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-emerald-700">Conforme au devis signé.</p>
              )}
            </>
          ) : null}
          {valide.details && resumeDetails(valide.details).length ? (
            <div className="rounded bg-slate-50 px-2 py-1.5 text-xs">
              <p className="font-semibold">Précisions du client</p>
              <ul className="mt-0.5 space-y-0.5">
                {resumeDetails(valide.details).map((l) => (
                  <li key={l}>· {l}</li>
                ))}
              </ul>
              {valide.details.photos.length ? (
                <p className="mt-1 text-muted-foreground">Photos : bloc Documents (« Photo client — … »).</p>
              ) : null}
            </div>
          ) : null}
          {valide.ip ? (
            <p className="text-[11px] text-muted-foreground">Validation enregistrée depuis l&apos;adresse IP {valide.ip}</p>
          ) : null}
          <button type="button" className={BTN} onClick={() => setConfirmer(true)} disabled={pending}>
            <RotateCcw className="size-3.5" /> Rouvrir la configuration
          </button>
        </>
      )}

      <ConfirmDialog
        open={confirmer}
        titre="Rouvrir la configuration du client ?"
        description="Le client retrouve sa dernière configuration dans son espace, à revoir et revalider. La validation actuelle est archivée."
        confirmLabel="Rouvrir"
        pending={pending}
        onConfirm={rouvrir}
        onCancel={() => !pending && setConfirmer(false)}
      />
    </div>
  );
}
