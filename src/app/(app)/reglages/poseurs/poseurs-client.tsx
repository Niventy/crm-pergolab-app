"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Check, Archive, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { formatTelephone } from "@/lib/format";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  creerPoseur,
  updatePoseur,
  setPoseurActif,
  type PoseurDTO,
} from "@/app/(app)/leads/[id]/poseur-actions";

const chantiers = (n: number) => (n > 0 ? `${n} chantier${n > 1 ? "s" : ""}` : "aucun chantier");

export function PoseursClient({
  poseurs,
  compte,
}: {
  poseurs: PoseurDTO[];
  compte: Record<string, number>;
}) {
  const [showNew, setShowNew] = useState(false);
  const actifs = poseurs.filter((p) => p.actif);
  const retires = poseurs.filter((p) => !p.actif);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        {showNew ? (
          <PoseurCard onClose={() => setShowNew(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-4" /> Nouveau poseur
          </button>
        )}
        {actifs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            Aucun poseur dans la liste : ajoute-les ici, ou depuis une fiche client
            (« Nouveau poseur… »).
          </p>
        ) : (
          actifs.map((p) => <PoseurCard key={p.id} poseur={p} nb={compte[p.id] ?? 0} />)
        )}
      </section>

      {retires.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-eyebrow text-muted-foreground">
            Poseurs retirés ({retires.length}) — plus proposés, mais leurs chantiers gardent
            leur nom
          </h2>
          {retires.map((p) => (
            <PoseurRetire key={p.id} poseur={p} nb={compte[p.id] ?? 0} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function PoseurCard({
  poseur,
  nb = 0,
  onClose,
}: {
  poseur?: PoseurDTO;
  nb?: number;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [nom, setNom] = useState(poseur?.nom ?? "");
  const [telephone, setTelephone] = useState(poseur?.telephone ?? "");
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [confirmRetrait, setConfirmRetrait] = useState(false);

  function enregistrer() {
    start(async () => {
      const r = poseur
        ? await updatePoseur(poseur.id, { nom, telephone })
        : await creerPoseur({ nom, telephone });
      if (r.ok) {
        setSaved(true);
        toast.success(poseur ? `« ${nom.trim()} » mis à jour` : `« ${nom.trim()} » ajouté aux poseurs`);
        onClose?.();
        router.refresh();
      } else toast.error(r.error ?? "Échec");
    });
  }

  function retirer() {
    if (!poseur) return;
    start(async () => {
      const r = await setPoseurActif(poseur.id, false);
      setConfirmRetrait(false);
      if (r.ok) {
        toast.success(`« ${poseur.nom} » retiré de la liste`);
        router.refresh();
      } else toast.error(r.error ?? "Échec");
    });
  }

  const inputCls =
    "h-9 w-full rounded-md border border-border bg-white px-2 text-sm outline-none focus:border-primary";

  return (
    <div className="space-y-2 rounded-xl border border-border bg-white p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_14rem]">
        <input
          value={nom}
          autoFocus={!poseur}
          onChange={(e) => {
            setNom(e.target.value);
            setSaved(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && nom.trim()) enregistrer();
          }}
          placeholder="Nom du poseur ou de l'équipe (ex. Benjamin)"
          className={`${inputCls} font-medium`}
        />
        <input
          type="tel"
          value={telephone}
          onChange={(e) => {
            setTelephone(e.target.value);
            setSaved(false);
          }}
          placeholder="Téléphone (facultatif)"
          className={inputCls}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{poseur ? chantiers(nb) : ""}</span>
        <div className="flex items-center gap-2">
          {saved ? (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="size-3.5" /> Enregistré
            </span>
          ) : null}
          {poseur ? (
            <button
              type="button"
              onClick={() => setConfirmRetrait(true)}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-red-600"
            >
              <Archive className="size-3.5" /> Retirer
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Annuler
            </button>
          )}
          <button
            type="button"
            onClick={enregistrer}
            disabled={pending || !nom.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {poseur ? "Enregistrer" : "Ajouter"}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRetrait}
        titre={`Retirer « ${nom} » de la liste des poseurs ?`}
        description="Il ne sera plus proposé sur les fiches. Ses chantiers gardent son nom. Tu pourras le réactiver."
        confirmLabel="Retirer"
        danger
        pending={pending}
        onConfirm={retirer}
        onCancel={() => setConfirmRetrait(false)}
      />
    </div>
  );
}

function PoseurRetire({ poseur, nb }: { poseur: PoseurDTO; nb: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2 text-sm">
      <span className="font-medium text-foreground">{poseur.nom}</span>
      <span className="text-xs text-muted-foreground">
        {[poseur.telephone ? formatTelephone(poseur.telephone) : null, chantiers(nb)]
          .filter(Boolean)
          .join(" · ")}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await setPoseurActif(poseur.id, true);
            if (r.ok) {
              toast.success(`« ${poseur.nom} » réactivé`);
              router.refresh();
            } else toast.error(r.error ?? "Échec");
          })
        }
        className="ml-auto inline-flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
        Réactiver
      </button>
    </div>
  );
}
