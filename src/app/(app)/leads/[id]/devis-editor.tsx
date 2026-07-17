"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, FileText, Download, ExternalLink, Pencil } from "lucide-react";
import { toast } from "sonner";
import { formatEuros } from "@/lib/format";
import {
  creerDevis,
  fetchProduits,
  getDevisLines,
  modifierDevis,
  devisAppUrl,
  devisPdfUrl,
} from "./actions";

type Line = {
  designation: string;
  quantite: number;
  prixHt: number;
  tva: number;
  productId?: number | null;
};
type Produit = {
  id: number;
  label: string;
  description: string | null;
  prixHt: number;
  tva: number;
  reference: string | null;
};
type DevisRow = {
  id: string;
  numero: string | null;
  montant: string | null;
  statut: string | null;
  lienExterne: string | null;
  externalId: string | null;
};

const TVA_OPTIONS = [20, 10, 5.5, 0];
const eur = (n: number) => formatEuros(String(Math.round(n * 100) / 100));

// Ouvre une URL Pennylane dans un onglet créé DANS le geste (anti-popup-blocker).
function ouvrirDans(
  getUrl: () => Promise<{ ok?: boolean; url?: string; error?: string } | string>,
) {
  const w = window.open("", "_blank");
  Promise.resolve(getUrl()).then((r) => {
    const url = typeof r === "string" ? r : r.url;
    if (url && w) w.location.href = url;
    else {
      if (w) w.close();
      toast.error((typeof r === "object" && r.error) || "Lien indisponible");
    }
  });
}

export function DevisEditor({
  leadId,
  devisExistants,
  pennylaneConfigured,
  prefill,
}: {
  leadId: string;
  devisExistants: DevisRow[];
  pennylaneConfigured: boolean;
  prefill: { designation: string; prixHt: number };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [produits, setProduits] = useState<Produit[] | null>(null);
  const [produitsErr, setProduitsErr] = useState<string | null>(null);
  // Devis en cours d'édition (null = création d'un nouveau devis).
  const [editing, setEditing] = useState<{
    devisId: string;
    quoteId: string;
    numero: string;
  } | null>(null);
  const [lines, setLines] = useState<Line[]>([
    { designation: prefill.designation, quantite: 1, prixHt: prefill.prixHt, tva: 20 },
  ]);

  const lignesDefaut = (): Line[] => [
    { designation: prefill.designation, quantite: 1, prixHt: prefill.prixHt, tva: 20 },
  ];

  // Ouvre l'éditeur sur un devis existant en chargeant ses lignes depuis Pennylane.
  function editer(d: DevisRow) {
    if (!d.externalId) return;
    start(async () => {
      const r = await getDevisLines(d.externalId!);
      if (!r.ok || !r.lines?.length) {
        toast.error(r.error ?? "Impossible de charger les lignes du devis");
        return;
      }
      setLines(r.lines as Line[]);
      setEditing({
        devisId: d.id,
        quoteId: d.externalId!,
        numero: d.numero ?? "Devis",
      });
      setOpen(true);
    });
  }

  function fermer() {
    setOpen(false);
    setEditing(null);
    setLines(lignesDefaut());
  }

  // Enregistre les modifications d'un devis existant.
  function enregistrer() {
    if (!editing) return;
    if (!lines.some((l) => l.designation.trim())) {
      toast.error("Ajoute au moins une désignation.");
      return;
    }
    start(async () => {
      const r = await modifierDevis(leadId, editing.devisId, editing.quoteId, lines);
      if (r.ok) {
        toast.success(`Devis ${editing.numero} mis à jour`);
        fermer();
        router.refresh();
      } else {
        toast.error(r.error ?? "Échec de la mise à jour");
      }
    });
  }

  useEffect(() => {
    if (!open || produits !== null) return;
    fetchProduits().then((r) => {
      if (r.ok) {
        setProduits(r.produits ?? []);
        setProduitsErr(null);
      } else {
        setProduits([]);
        setProduitsErr(r.error ?? null);
      }
    });
  }, [open, produits]);

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const addLine = () =>
    setLines((ls) => [...ls, { designation: "", quantite: 1, prixHt: 0, tva: 20 }]);
  const removeLine = (i: number) =>
    setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : ls));
  const addProduit = (p: Produit) =>
    setLines((ls) => [
      ...ls,
      { designation: p.label, quantite: 1, prixHt: p.prixHt, tva: p.tva, productId: p.id },
    ]);

  const ht = lines.reduce((a, l) => a + (l.quantite || 0) * (l.prixHt || 0), 0);
  const tvaAmt = lines.reduce(
    (a, l) => a + (l.quantite || 0) * (l.prixHt || 0) * ((l.tva || 0) / 100),
    0,
  );
  const ttc = ht + tvaAmt;

  function creer() {
    if (!lines.some((l) => l.designation.trim())) {
      toast.error("Ajoute au moins une désignation.");
      return;
    }
    const w = window.open("", "_blank"); // onglet PDF ouvert dans le geste
    start(async () => {
      const r = await creerDevis(leadId, lines);
      if (r.ok) {
        toast.success(`Devis ${r.numero ?? ""} créé`);
        if (r.quoteId) {
          const p = await devisPdfUrl(r.quoteId);
          if (p.ok && p.url && w) w.location.href = p.url;
          else if (w) w.close();
        } else if (w) {
          w.close();
        }
        setOpen(false);
        router.refresh();
      } else {
        if (w) w.close();
        toast.error(r.error ?? "Échec de la création");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Devis existants */}
      {devisExistants.length > 0 ? (
        <ul className="divide-y divide-border">
          {devisExistants.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2 text-sm">
              <FileText className="size-4 text-muted-foreground" />
              <span className="font-medium text-foreground">{d.numero ?? "Devis"}</span>
              <span className="tabular-nums text-muted-foreground">
                {formatEuros(d.montant)}
              </span>
              {d.statut ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {d.statut}
                </span>
              ) : null}
              <span className="ml-auto flex items-center gap-3">
                {d.externalId ? (
                  <>
                    <button
                      type="button"
                      onClick={() => editer(d)}
                      disabled={pending}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                    >
                      <Pencil className="size-3.5" /> Éditer
                    </button>
                    <button
                      type="button"
                      onClick={() => ouvrirDans(() => devisAppUrl(d.externalId!))}
                      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="size-3.5" /> Pennylane
                    </button>
                    <button
                      type="button"
                      onClick={() => ouvrirDans(() => devisPdfUrl(d.externalId!))}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <Download className="size-3.5" /> PDF
                    </button>
                  </>
                ) : d.lienExterne ? (
                  <a
                    href={d.lienExterne}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Ouvrir ↗
                  </a>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Aucun devis pour l&apos;instant.</p>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="size-4" /> Créer un devis
        </button>
      ) : (
        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
          <div className="text-eyebrow text-muted-foreground">
            {editing ? `Modifier le devis ${editing.numero}` : "Nouveau devis"}
          </div>
          {!pennylaneConfigured ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Pennylane n&apos;est pas encore configuré (<code>PENNYLANE_API_KEY</code>).
              Tu peux composer le devis, mais la création échouera tant que la clé
              n&apos;est pas ajoutée sur Vercel.
            </p>
          ) : null}

          {/* Présélection produit (catalogue Pennylane) */}
          <select
            value=""
            onChange={(e) => {
              const id = Number(e.target.value);
              const p = produits?.find((x) => x.id === id);
              if (p) addProduit(p);
              e.currentTarget.value = "";
            }}
            disabled={!produits || produits.length === 0}
            className="h-9 w-full rounded-md border border-border bg-white px-2 text-sm outline-none focus:border-primary disabled:opacity-60"
          >
            <option value="">
              {produits === null
                ? "Chargement du catalogue…"
                : produits.length === 0
                  ? "Aucune présélection (catalogue Pennylane vide)"
                  : "+ Ajouter une présélection (Essentia…)"}
            </option>
            {(produits ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} — {eur(p.prixHt)} HT
              </option>
            ))}
          </select>
          {produitsErr && produitsErr !== "Pennylane non configuré." ? (
            <p className="text-xs text-muted-foreground">Catalogue : {produitsErr}</p>
          ) : null}

          {/* En-têtes */}
          <div className="hidden grid-cols-[1fr_4rem_6rem_5rem_2rem] gap-2 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
            <span>Désignation</span>
            <span className="text-right">Qté</span>
            <span className="text-right">Prix HT</span>
            <span className="text-right">TVA</span>
            <span />
          </div>

          {lines.map((l, i) => (
            <div
              key={i}
              className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_4rem_6rem_5rem_2rem]"
            >
              <input
                value={l.designation}
                onChange={(e) => setLine(i, { designation: e.target.value })}
                placeholder="ex. Pergola bioclimatique 4x4"
                className="col-span-2 h-9 rounded-md border border-border bg-white px-2 text-sm outline-none focus:border-primary sm:col-span-1"
              />
              <input
                type="number"
                min={1}
                value={l.quantite}
                onChange={(e) => setLine(i, { quantite: Number(e.target.value) })}
                className="h-9 rounded-md border border-border bg-white px-2 text-right text-sm outline-none focus:border-primary"
                aria-label="Quantité"
              />
              <input
                type="number"
                min={0}
                step="0.01"
                value={l.prixHt}
                onChange={(e) => setLine(i, { prixHt: Number(e.target.value) })}
                className="h-9 rounded-md border border-border bg-white px-2 text-right text-sm outline-none focus:border-primary"
                aria-label="Prix HT"
              />
              <select
                value={l.tva}
                onChange={(e) => setLine(i, { tva: Number(e.target.value) })}
                className="h-9 rounded-md border border-border bg-white px-1 text-sm outline-none focus:border-primary"
                aria-label="TVA"
              >
                {TVA_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t} %
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeLine(i)}
                disabled={lines.length === 1}
                className="flex h-9 items-center justify-center text-muted-foreground hover:text-red-600 disabled:opacity-30"
                aria-label="Supprimer la ligne"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addLine}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Plus className="size-3.5" /> Ajouter une ligne libre
          </button>

          {/* Totaux */}
          <div className="flex flex-col items-end gap-0.5 border-t border-border pt-2 text-sm">
            <div className="text-muted-foreground">
              Total HT : <span className="tabular-nums text-foreground">{eur(ht)}</span>
            </div>
            <div className="text-muted-foreground">
              TVA : <span className="tabular-nums text-foreground">{eur(tvaAmt)}</span>
            </div>
            <div className="font-semibold">
              Total TTC : <span className="tabular-nums">{eur(ttc)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {editing ? (
              <button
                type="button"
                onClick={enregistrer}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <FileText className="size-4" />
                {pending ? "Enregistrement…" : "Enregistrer les modifications"}
              </button>
            ) : (
              <button
                type="button"
                onClick={creer}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <FileText className="size-4" />
                {pending ? "Création…" : "Créer le devis + PDF"}
              </button>
            )}
            {editing ? (
              <button
                type="button"
                onClick={() => ouvrirDans(() => devisPdfUrl(editing.quoteId))}
                disabled={pending}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline disabled:opacity-50"
              >
                <Download className="size-3.5" /> Voir le PDF
              </button>
            ) : null}
            <button
              type="button"
              onClick={fermer}
              disabled={pending}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
