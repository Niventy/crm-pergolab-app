"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, Link2, Mail, RefreshCw, Unlink } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatHorodatage, tempsRelatif } from "@/lib/format";
import {
  creerLienEspaceClient,
  envoyerAccesParEmail,
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
  emailClient,
  emailActif,
}: {
  leadId: string;
  acces: AccesClientDTO | null;
  emailClient: string | null;
  /** Envoi Gmail configuré (sinon bouton désactivé, expliqué). */
  emailActif: boolean;
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

  function envoyerEmail() {
    start(async () => {
      const r = await envoyerAccesParEmail(leadId);
      if (!r.ok) return void toast.error(r.error ?? "Échec de l'envoi");
      toast.success(`Email « Accéder à mon projet » envoyé à ${emailClient}`);
      router.refresh();
    });
  }

  const boutonEmail = (
    <button
      type="button"
      className={BTN + " border-primary/40 text-primary"}
      onClick={envoyerEmail}
      disabled={pending || !emailClient || !emailActif}
      title={
        !emailActif
          ? "Envoi d'emails pas encore configuré (Google) : copie le lien et envoie-le toi-même"
          : emailClient
            ? `Envoyer à ${emailClient}`
            : "Ajoute l'email du client sur la fiche"
      }
    >
      <Mail className="size-3.5" /> Envoyer l&apos;accès par email
    </button>
  );

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
          Une page privée où le client suit son chantier, retrouve devis, factures et
          documents, et nous écrit. Il se connecte avec son email, sans mot de passe.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {boutonEmail}
          <button type="button" className={BTN} onClick={creer} disabled={pending}>
            <Link2 className="size-3.5" /> Créer le lien et le copier
          </button>
        </div>
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
        {boutonEmail}
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
      {!emailActif ? (
        <p className="text-xs text-amber-700">
          Envoi par email pas encore activé : copie le lien et envoie-le par SMS ou depuis ta boîte.
        </p>
      ) : null}
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
