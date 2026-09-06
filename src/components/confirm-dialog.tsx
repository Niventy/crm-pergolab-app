"use client";

import { useEffect } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Boîte de confirmation maison (remplace `confirm()` natif : cohérente avec le
// design, fermeture par Échap / clic extérieur, état « en cours »).
export function ConfirmDialog({
  open,
  titre,
  description,
  confirmLabel = "Confirmer",
  danger = false,
  pending = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  titre: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
  pending?: boolean;
  /** Ex. commentaire obligatoire non saisi. */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Contenu additionnel (champ de saisie, récap…). */
  children?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-titre"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={() => !pending && onCancel()}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full",
              danger ? "bg-red-100 text-red-600" : "bg-primary/10 text-primary",
            )}
          >
            <AlertTriangle className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="confirm-titre" className="text-base font-semibold text-foreground">
              {titre}
            </h2>
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        {children ? <div className="mt-4">{children}</div> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={pending}>
            Annuler
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onConfirm}
            disabled={pending || confirmDisabled}
            className={cn(danger && "bg-red-600 text-white hover:bg-red-700")}
            autoFocus={!children}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
