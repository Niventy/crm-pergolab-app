"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { TVA_OPTIONS, tauxLabel } from "@/lib/devis-calc";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  addProduitCatalogue,
  updateProduitCatalogue,
  deleteProduitCatalogue,
  type ProduitCatalogueDTO,
} from "../actions";

const CATEGORIES = [
  "Pergola",
  "Menuiserie",
  "Option",
  "Énergie",
  "Forfait",
  "Clause",
  "Autre",
];

type Draft = {
  nom: string;
  categorie: string;
  prixHt: string;
  tva: string;
  actif: boolean;
  description: string;
};

const toDraft = (p: ProduitCatalogueDTO): Draft => ({
  nom: p.nom,
  categorie: p.categorie ?? "",
  prixHt: p.prixHt ? String(p.prixHt) : "",
  tva: String(p.tva ?? 20),
  actif: p.actif,
  description: p.description ?? "",
});

export function ProduitsCatalogueClient({
  produits,
}: {
  produits: ProduitCatalogueDTO[];
}) {
  const [showNew, setShowNew] = useState(false);

  return (
    <div className="space-y-3">
      {showNew ? (
        <ProduitCard
          onClose={() => setShowNew(false)}
          initial={{
            nom: "",
            categorie: "",
            prixHt: "",
            tva: "20",
            actif: true,
            description: "",
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="size-4" /> Nouveau produit
        </button>
      )}

      {produits.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          Aucun produit dans le catalogue. Ajoute-en un ci-dessus.
        </p>
      ) : (
        produits.map((p) => (
          <ProduitCard key={p.id} id={p.id} initial={toDraft(p)} />
        ))
      )}
    </div>
  );
}

function ProduitCard({
  id,
  initial,
  onClose,
}: {
  id?: string;
  initial: Draft;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [confirmSuppr, setConfirmSuppr] = useState(false);
  const set = (patch: Partial<Draft>) => {
    setD((cur) => ({ ...cur, ...patch }));
    setSaved(false);
  };

  function enregistrer() {
    start(async () => {
      const payload = {
        nom: d.nom,
        categorie: d.categorie || null,
        prixHt: d.prixHt === "" ? null : Number(d.prixHt),
        tva: d.tva === "" ? 20 : Number(d.tva),
        actif: d.actif,
        description: d.description,
      };
      const r = id
        ? await updateProduitCatalogue(id, payload)
        : await addProduitCatalogue(payload);
      if (r.ok) {
        setSaved(true);
        toast.success(id ? "Produit mis à jour" : "Produit ajouté");
        onClose?.();
        router.refresh();
      } else toast.error(r.error ?? "Échec");
    });
  }

  function supprimer() {
    if (!id) return onClose?.();
    setConfirmSuppr(true);
  }

  function supprimerConfirme() {
    if (!id) return;
    start(async () => {
      const r = await deleteProduitCatalogue(id);
      setConfirmSuppr(false);
      if (r.ok) {
        toast.success("Produit supprimé");
        router.refresh();
      } else toast.error(r.error ?? "Échec");
    });
  }

  return (
    <div className="space-y-2 rounded-xl border border-border bg-white p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_9rem_6rem_5rem]">
        <input
          value={d.nom}
          onChange={(e) => set({ nom: e.target.value })}
          placeholder="Nom du produit"
          className="h-9 rounded-md border border-border bg-white px-2 text-sm font-medium outline-none focus:border-primary"
        />
        <select
          value={d.categorie}
          onChange={(e) => set({ categorie: e.target.value })}
          className="h-9 rounded-md border border-border bg-white px-2 text-sm outline-none focus:border-primary"
        >
          <option value="">— catégorie —</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 rounded-md border border-border px-2 text-sm">
          <input
            type="number"
            min={0}
            step="0.01"
            value={d.prixHt}
            onChange={(e) => set({ prixHt: e.target.value })}
            placeholder="Prix HT"
            aria-label="Prix HT"
            className="h-8 w-full bg-transparent text-right outline-none"
          />
          <span className="text-muted-foreground">€</span>
        </label>
        {/* Taux limités à ceux gérés par le devis / Pennylane (un taux libre
            comme 0 partait silencieusement à 20 % sur la facture). */}
        <select
          value={d.tva}
          onChange={(e) => set({ tva: e.target.value })}
          aria-label="TVA"
          className="h-9 rounded-md border border-border bg-white px-2 text-sm outline-none focus:border-primary"
        >
          {TVA_OPTIONS.map((t) => (
            <option key={t} value={String(t)}>
              TVA {tauxLabel(t)}
            </option>
          ))}
        </select>
      </div>

      <textarea
        value={d.description}
        onChange={(e) => set({ description: e.target.value })}
        rows={3}
        placeholder="Description (apparaît sur le devis)…"
        className="w-full resize-y rounded-md border border-border bg-white px-2.5 py-1.5 text-sm outline-none focus:border-primary"
      />

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={d.actif}
            onChange={(e) => set({ actif: e.target.checked })}
          />
          Actif (proposé sur les devis)
        </label>
        <div className="flex items-center gap-2">
          {saved ? (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="size-3.5" /> Enregistré
            </span>
          ) : null}
          <button
            type="button"
            onClick={supprimer}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-red-600"
          >
            <Trash2 className="size-3.5" /> {id ? "Supprimer" : "Annuler"}
          </button>
          <button
            type="button"
            onClick={enregistrer}
            disabled={pending || !d.nom.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Enregistrer
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmSuppr}
        titre={`Supprimer « ${d.nom} » du catalogue ?`}
        description="Les devis déjà créés ne sont pas modifiés ; le produit ne sera plus proposé."
        confirmLabel="Supprimer"
        danger
        pending={pending}
        onConfirm={supprimerConfirme}
        onCancel={() => setConfirmSuppr(false)}
      />
    </div>
  );
}
