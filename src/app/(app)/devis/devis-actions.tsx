"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Download, User, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ouvrirDans } from "@/lib/ouvrir-dans";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { supprimerDevis } from "@/app/(app)/leads/[id]/actions";
import { devisAppUrl, devisPdfUrl } from "./actions";

export function DevisActions({
  externalId,
  leadId,
  devisId,
  numero,
  accepte,
}: {
  externalId: string | null;
  leadId: string;
  devisId: string;
  numero: string | null;
  /** Devis signé : pas de suppression possible. */
  accepte: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);

  const supprimer = () =>
    start(async () => {
      const r = await supprimerDevis(leadId, devisId);
      setConfirm(false);
      if (r.ok) {
        toast.success(`Devis ${numero ?? ""} supprimé`.trim(), {
          description: r.pennylaneRestant
            ? "Le brouillon reste dans Pennylane : archive-le là-bas si besoin."
            : undefined,
        });
        router.refresh();
      } else toast.error(r.error ?? "Échec de la suppression");
    });

  return (
    <div className="flex items-center justify-end gap-3 whitespace-nowrap">
      <Link
        href={`/leads/${leadId}/devis/${devisId}`}
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        <Pencil className="size-3.5" /> Éditer
      </Link>
      {externalId ? (
        <>
          <button
            type="button"
            onClick={() => ouvrirDans(() => devisAppUrl(externalId))}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="size-3.5" /> Pennylane
          </button>
          <button
            type="button"
            onClick={() => ouvrirDans(() => devisPdfUrl(externalId))}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Download className="size-3.5" /> PDF
          </button>
        </>
      ) : null}
      <Link
        href={`/leads/${leadId}`}
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <User className="size-3.5" /> Fiche
      </Link>
      {!accepte ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirm(true)}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-red-600 disabled:opacity-50"
          title="Supprimer ce devis du CRM (un devis signé ne se supprime pas)"
        >
          <Trash2 className="size-3.5" /> Supprimer
        </button>
      ) : null}
      <ConfirmDialog
        open={confirm}
        titre={`Supprimer le devis ${numero ?? ""} ?`}
        description="Il disparaît du CRM et le montant de la fiche est recalculé sur les devis restants. Le brouillon reste dans Pennylane (à archiver là-bas si besoin)."
        confirmLabel="Supprimer"
        danger
        pending={pending}
        onConfirm={supprimer}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}
