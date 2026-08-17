"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, FileText, Download, ExternalLink, RefreshCw, Calculator } from "lucide-react";
import { toast } from "sonner";
import { formatEuros } from "@/lib/format";
import { SurMesureCalc } from "./sur-mesure-calc";
import {
  creerDevis,
  fetchProduits,
  getDevisLines,
  modifierDevis,
  devisAppUrl,
  devisPdfUrl,
} from "../../actions";

type Line = {
  id?: number | null; // id de la ligne côté Pennylane (absent = ligne à créer)
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

const TVA_OPTIONS = [20, 10, 5.5, 0];
const eur = (n: number) => formatEuros(String(Math.round(n * 100) / 100));

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

type Infos = {
  typeProjet: string | null;
  dimensions: string | null;
  gamme: string | null;
  dateSouhaiteeAppel: string | null;
  dateInstallation: string | null;
  etape: string | null;
  responsable: string | null;
  rdvDate: string | null;
  rdvHeure: string | null;
};

function Info({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm text-foreground">{value.replace(/_/g, " ")}</div>
    </div>
  );
}

export function DevisForm({
  leadId,
  devisId,
  quoteId,
  numero,
  pennylaneConfigured,
  prefill,
  client,
  infos,
}: {
  leadId: string;
  devisId: string | null;
  quoteId: string | null;
  numero: string | null;
  pennylaneConfigured: boolean;
  prefill: { designation: string; prixHt: number };
  client: {
    nom: string;
    email: string | null;
    telephone: string | null;
    adresse: string | null;
    ville: string | null;
    codePostal: string | null;
  };
  infos: Infos;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [produits, setProduits] = useState<Produit[] | null>(null);
  const [smOpen, setSmOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfKey, setPdfKey] = useState(0); // force le rechargement de l'iframe
  const [lines, setLines] = useState<Line[]>([
    { designation: prefill.designation, quantite: 1, prixHt: prefill.prixHt, tva: 20 },
  ]);

  // Catalogue de présélections.
  useEffect(() => {
    fetchProduits().then((r) => setProduits(r.ok ? (r.produits ?? []) : []));
  }, []);

  // Devis existant : charge ses lignes + son PDF.
  useEffect(() => {
    if (!quoteId) return;
    getDevisLines(quoteId).then((r) => {
      if (r.ok && r.lines?.length) setLines(r.lines as Line[]);
    });
    devisPdfUrl(quoteId).then((r) => {
      if (r.ok && r.url) setPdfUrl(r.url);
    });
  }, [quoteId]);

  function rafraichirPdf() {
    if (!quoteId) return;
    setPdfLoading(true);
    devisPdfUrl(quoteId).then((r) => {
      if (r.ok && r.url) {
        setPdfUrl(r.url);
        setPdfKey((k) => k + 1);
      } else toast.error(r.error ?? "PDF indisponible");
      setPdfLoading(false);
    });
  }

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

  const remplies = () => lines.filter((l) => l.designation.trim());
  const ht = lines.reduce((a, l) => a + (l.quantite || 0) * (l.prixHt || 0), 0);
  const tvaAmt = lines.reduce(
    (a, l) => a + (l.quantite || 0) * (l.prixHt || 0) * ((l.tva || 0) / 100),
    0,
  );
  const ttc = ht + tvaAmt;

  function enregistrer() {
    const utiles = remplies();
    if (!utiles.length) {
      toast.error("Ajoute au moins une désignation.");
      return;
    }
    start(async () => {
      if (quoteId && devisId) {
        const r = await modifierDevis(leadId, devisId, quoteId, utiles);
        if (r.ok) {
          toast.success("Devis mis à jour");
          // Recharge les lignes : les nouvelles récupèrent leur id Pennylane
          // (sinon un 2e enregistrement les recréerait en double).
          const fresh = await getDevisLines(quoteId);
          if (fresh.ok && fresh.lines?.length) setLines(fresh.lines as Line[]);
          rafraichirPdf();
          router.refresh();
        } else {
          toast.error(r.error ?? "Échec de la mise à jour");
        }
      } else {
        const r = await creerDevis(leadId, utiles);
        if (r.ok && r.devisId) {
          toast.success(`Devis ${r.numero ?? ""} créé`);
          router.replace(`/leads/${leadId}/devis/${r.devisId}`);
        } else {
          toast.error(r.error ?? "Échec de la création");
        }
      }
    });
  }

  return (
    <div className="grid flex-1 grid-cols-1 items-start gap-4 lg:grid-cols-[2fr_3fr]">
      {/* --- Colonne gauche : éditeur + fiche simplifiée --- */}
      <div className="space-y-4">
      <div className="space-y-3 rounded-xl border border-border bg-white p-4">
        {!pennylaneConfigured ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Pennylane n&apos;est pas configuré (<code>PENNYLANE_API_KEY</code>).
          </p>
        ) : null}

        {/* Présélections + sur-mesure */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value=""
            onChange={(e) => {
              const id = Number(e.target.value);
              const p = produits?.find((x) => x.id === id);
              if (p) addProduit(p);
              e.currentTarget.value = "";
            }}
            disabled={!produits || produits.length === 0}
            className="h-9 min-w-[14rem] flex-1 rounded-md border border-border bg-white px-2 text-sm outline-none focus:border-primary disabled:opacity-60"
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
          <button
            type="button"
            onClick={() => setSmOpen((v) => !v)}
            className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold ${
              smOpen
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-white text-foreground hover:border-primary/40"
            }`}
          >
            <Calculator className="size-4" /> Sur-mesure
          </button>
        </div>

        {smOpen ? (
          <SurMesureCalc
            onAjouter={(ls) => {
              setLines((cur) => {
                const base = cur.filter((l) => l.designation.trim());
                return [...base, ...ls];
              });
              setSmOpen(false);
              toast.success(`${ls.length} ligne(s) sur-mesure ajoutée(s)`);
            }}
            onClose={() => setSmOpen(false)}
          />
        ) : null}

        <div className="hidden grid-cols-[1fr_3.5rem_6rem_5rem_2rem] gap-2 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
          <span>Désignation</span>
          <span className="text-right">Qté</span>
          <span className="text-right">Prix HT</span>
          <span className="text-right">TVA</span>
          <span />
        </div>

        {lines.map((l, i) => (
          <div
            key={i}
            className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_3.5rem_6rem_5rem_2rem]"
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

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={enregistrer}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <FileText className="size-4" />
            {pending
              ? "Enregistrement…"
              : quoteId
                ? "Enregistrer les modifications"
                : "Créer le devis"}
          </button>
          {quoteId ? (
            <>
              <button
                type="button"
                onClick={() => ouvrirDans(() => devisPdfUrl(quoteId))}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                <Download className="size-3.5" /> Télécharger le PDF
              </button>
              <button
                type="button"
                onClick={() => ouvrirDans(() => devisAppUrl(quoteId))}
                className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="size-3.5" /> Pennylane
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* Le prospect : contacter + localiser (l'essentiel pendant la rédaction) */}
      <div className="space-y-3 rounded-xl border border-border bg-white p-4">
        <div className="flex items-center justify-between">
          <span className="text-eyebrow text-muted-foreground">Le prospect</span>
          <Link
            href={`/leads/${leadId}`}
            className="text-xs font-medium text-primary hover:underline"
          >
            Ouvrir la fiche ↗
          </Link>
        </div>

        {/* Contacter — cliquable */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-muted/40 px-3 py-2">
            <div className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
              Téléphone
            </div>
            {client.telephone ? (
              <a
                href={`tel:${client.telephone.replace(/[^+\d]/g, "")}`}
                className="text-base font-semibold text-primary hover:underline"
              >
                {client.telephone}
              </a>
            ) : (
              <div className="text-sm text-muted-foreground">—</div>
            )}
          </div>
          <div className="rounded-lg bg-muted/40 px-3 py-2">
            <div className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
              Email
            </div>
            {client.email ? (
              <a
                href={`mailto:${client.email}`}
                className="text-sm font-medium break-all text-primary hover:underline"
              >
                {client.email}
              </a>
            ) : (
              <div className="text-sm text-muted-foreground">—</div>
            )}
          </div>
        </div>

        {/* Localisation */}
        <div className="rounded-lg bg-muted/40 px-3 py-2">
          <div className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
            Localisation
          </div>
          <div className="text-sm font-medium text-foreground">
            {[
              client.adresse,
              [client.codePostal, client.ville].filter(Boolean).join(" "),
            ]
              .filter(Boolean)
              .join(", ") || (
              <span className="text-amber-700">Adresse à compléter</span>
            )}
          </div>
        </div>

        {/* Contexte utile */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Info label="Appel souhaité" value={infos.dateSouhaiteeAppel} />
          <Info
            label="RDV"
            value={
              infos.rdvDate
                ? `${infos.rdvDate.split("-").reverse().join("/")}${
                    infos.rdvHeure ? ` · ${infos.rdvHeure}` : ""
                  }`
                : null
            }
          />
          <Info label="Installation" value={infos.dateInstallation} />
          <Info
            label="Type de projet"
            value={infos.typeProjet ?? infos.dimensions}
          />
          <Info label="Gamme" value={infos.gamme} />
          <Info label="Étape" value={infos.etape} />
          <Info label="Responsable" value={infos.responsable} />
        </div>
      </div>
      </div>

      {/* --- Prévisualisation PDF --- */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-eyebrow text-muted-foreground">
            Aperçu du devis {numero ? `· ${numero}` : ""}
          </span>
          {quoteId ? (
            <button
              type="button"
              onClick={rafraichirPdf}
              disabled={pdfLoading}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${pdfLoading ? "animate-spin" : ""}`} />
              Rafraîchir
            </button>
          ) : null}
        </div>

        {pdfUrl ? (
          // #navpanes=0 masque les vignettes, #view=Fit affiche la page entière.
          <iframe
            key={pdfKey}
            src={`${pdfUrl}#navpanes=0&toolbar=1&view=Fit`}
            title="Aperçu du devis"
            className="h-[calc(100vh-11rem)] min-h-[600px] w-full rounded-xl border border-border bg-white"
          />
        ) : (
          <div className="flex h-[calc(100vh-11rem)] min-h-[600px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-6 text-center text-sm text-muted-foreground">
            {quoteId
              ? "Chargement de l'aperçu…"
              : "L'aperçu PDF apparaîtra ici dès que le devis sera créé (c'est Pennylane qui le génère)."}
          </div>
        )}
      </div>
    </div>
  );
}
