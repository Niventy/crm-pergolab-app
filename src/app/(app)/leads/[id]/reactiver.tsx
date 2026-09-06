"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { reactiverLead } from "./prospect-actions";

// Réactive un prospect perdu (retour en « Rappeler »), avec motif obligatoire.
export function Reactiver({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [motif, setMotif] = useState("");
  const [pending, start] = useTransition();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted"
      >
        <RotateCcw className="size-3.5" /> Réactiver
      </button>
      <ConfirmDialog
        open={open}
        titre="Réactiver ce prospect ?"
        description="La fiche repasse « en cours » à l'étape Rappeler ; la raison de perte est effacée. Indique pourquoi."
        confirmLabel="Réactiver"
        pending={pending}
        confirmDisabled={!motif.trim()}
        onConfirm={() =>
          start(async () => {
            const r = await reactiverLead(leadId, motif);
            if (r.ok) {
              toast.success("Prospect réactivé → Rappeler");
              setOpen(false);
              router.refresh();
            } else toast.error(r.error ?? "Échec");
          })
        }
        onCancel={() => !pending && setOpen(false)}
      >
        <textarea
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          rows={2}
          autoFocus
          placeholder="ex. le client a rappelé, nouveau budget…"
          className="w-full resize-none rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </ConfirmDialog>
    </>
  );
}
