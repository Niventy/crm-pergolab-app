"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, Link2, RefreshCw, Unlink } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatHorodatage, tempsRelatif } from "@/lib/format";
import {
  creerLienEspaceClient,
  revoquerLienEspaceClient,
  type AccesClientDTO,
} from "./espace-client-actions";

const BTN =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50";

// Bloc « Espace client » de la fiche : crée / copie / renouvelle / coupe le lien
// magique que l'ADV transmet au client (suivi du chantier + devis, lecture seule).
export function EspaceClient({
  leadId,
  acces,
}: {
  leadId: string;
  acces: AccesClientDTO | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<"nouveau" | "couper" | null>(null);
  // L'origine n'est connue que côté navigateur (prod, préprod, dev…).
  const origine = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );

  const url = acces && origine ? `${origine}/espace/${acces.jeton}` : null;

  async function copier(lien: string) {
    try {
      await navigator.clipboard.writeText(lien);
      toast.success("Lien copié — à coller dans un email ou un SMS au client");
    } catch {
      toast.error("Copie impossible : sélectionne le lien à la main.");
    }
  }

  function creer() {
    start(async () => {
      const r = await creerLienEspaceClient(leadId);
      if (!r.ok) return void toast.error(r.error ?? "Échec");
      setConfirm(null);
      await copier(`${window.location.origin}/espace/${r.acces.jeton}`);
      router.refresh();
    });
  }

  function couper() {
    start(async () => {
      const r = await revoquerLienEspaceClient(leadId);
      if (!r.ok) return void toast.error(r.error ?? "Échec");
      setConfirm(null);
      toast.success("Accès coupé : le lien ne fonctionne plus");
      router.refresh();
    });
  }

  if (!acces) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Une page privée où le client suit son chantier et retrouve ses devis, sans
          compte ni mot de passe.
        </p>
        <button type="button" className={BTN} onClick={creer} disabled={pending}>
          <Link2 className="size-3.5" /> Créer le lien et le copier
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        readOnly
        value={url ?? ""}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full truncate rounded-md border border-border bg-muted/40 px-2 py-1 font-mono text-xs"
        aria-label="Lien de l'espace client"
      />
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={BTN} onClick={() => url && copier(url)} disabled={!url}>
          <Copy className="size-3.5" /> Copier
        </button>
        <a
          className={BTN}
          href={url ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink className="size-3.5" /> Voir comme le client
        </a>
        <button type="button" className={BTN} onClick={() => setConfirm("nouveau")} disabled={pending}>
          <RefreshCw className="size-3.5" /> Nouveau lien
        </button>
        <button type="button" className={BTN} onClick={() => setConfirm("couper")} disabled={pending}>
          <Unlink className="size-3.5" /> Couper l&apos;accès
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        {acces.derniereVisite
          ? `Ouvert ${acces.nbVisites} fois · dernière visite ${tempsRelatif(acces.derniereVisite)}`
          : "Pas encore ouvert par le client"}
        {acces.expiresAt ? ` · valable jusqu'au ${formatHorodatage(acces.expiresAt)}` : null}
      </p>

      <ConfirmDialog
        open={confirm === "nouveau"}
        titre="Générer un nouveau lien ?"
        description="L'ancien lien cessera immédiatement de fonctionner. Le nouveau est copié : pense à le renvoyer au client."
        confirmLabel="Nouveau lien"
        pending={pending}
        onConfirm={creer}
        onCancel={() => !pending && setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === "couper"}
        titre="Couper l'accès du client ?"
        description="Le lien ne fonctionnera plus. Tu pourras en créer un nouveau à tout moment."
        confirmLabel="Couper l'accès"
        danger
        pending={pending}
        onConfirm={couper}
        onCancel={() => !pending && setConfirm(null)}
      />
    </div>
  );
}
