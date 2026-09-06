"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { tempsRelatif } from "@/lib/format";
import { restoreLead } from "@/app/(app)/liste/actions";

// Bandeau « fiche à la corbeille » : visible par tous, restauration admin.
export function CorbeilleBanner({
  leadId,
  deletedAt,
  admin,
}: {
  leadId: string;
  deletedAt: Date | string;
  admin: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function restaurer() {
    start(async () => {
      const r = await restoreLead(leadId);
      if (r.ok) {
        toast.success("Fiche restaurée");
        router.refresh();
      } else toast.error(r.error ?? "Échec");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
      <Archive className="size-4 text-amber-700" />
      <span className="text-sm font-semibold text-amber-800">
        Cette fiche est à la corbeille (supprimée {tempsRelatif(deletedAt)}).
      </span>
      <span className="text-xs text-amber-700">
        Elle n&apos;apparaît plus dans le Kanban, la Liste ni les statistiques.
      </span>
      {admin ? (
        <button
          type="button"
          onClick={restaurer}
          disabled={pending}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
          Restaurer
        </button>
      ) : null}
    </div>
  );
}
