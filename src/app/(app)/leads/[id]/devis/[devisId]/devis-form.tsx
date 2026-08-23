"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, FileText, Download, ExternalLink, RefreshCw, Calculator, PenLine, Mail, Send, X, User } from "lucide-react";
import { toast } from "sonner";
import { formatEuros } from "@/lib/format";
import { SurMesureCalc } from "./sur-mesure-calc";
import { construireLignesDevis, type ConfigSM } from "./sur-mesure";
import type { ProduitCatalogueDTO } from "@/app/(app)/reglages/actions";
import { sendDevisParGmail } from "../../email-actions";
import {
  creerDevis,
  getDevisLines,
  modifierDevis,
  devisAppUrl,
  devisPdfUrl,
  devisSignatureUrl,
  creerContactSignataire,
} from "../../actions";

type Line = {
  id?: number | null; // id de la ligne côté Pennylane (absent = ligne à créer)
  designation: string;
  description?: string | null;
  quantite: number;
  prixHt: number;
  tva: number;
  productId?: number | null;
  config?: boolean; // ligne issue du configurateur (kit ou option)
};
const TVA_OPTIONS = [20, 10, 5.5, 0];
const eur = (n: number) => formatEuros(String(Math.round(n * 100) / 100));

// La (les) ligne(s) « Pergola » toujours en tête, les options après.
function ordonner(ls: Line[]): Line[] {
  const estPergola = (l: Line) => /^Pergola\b/i.test(l.designation.trim());
  return [...ls].sort((a, b) =>
    estPergola(a) === estPergola(b) ? 0 : estPergola(a) ? -1 : 1,
  );
}

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
  surMesureDescriptions,
  catalogue,
  client,
  infos,
}: {
  leadId: string;
  devisId: string | null;
  quoteId: string | null;
  numero: string | null;
  pennylaneConfigured: boolean;
  surMesureDescriptions: Record<string, string>;
  catalogue: ProduitCatalogueDTO[];
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
  const [smOpen, setSmOpen] = useState(false);
  // Config du configurateur, conservée tant que le devis est ouvert (pour
  // rouvrir sans tout ressaisir et pour remplacer proprement ses lignes).
  const [smConfig, setSmConfig] = useState<ConfigSM | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfKey, setPdfKey] = useState(0); // force le rechargement de l'iframe
  // Envoi du devis par email — via Gmail (adresse Pergolab de l'ADV), PDF en PJ.
  const [mailOpen, setMailOpen] = useState(false);
  const [mailTo, setMailTo] = useState(client.email ?? "");
  const [mailSubject, setMailSubject] = useState(
    `Votre devis PERGOLAB${numero ? ` N° ${numero}` : ""}`,
  );
  const [mailBody, setMailBody] = useState(
    `Bonjour ${client.nom},\n\nVeuillez trouver ci-joint votre devis PERGOLAB.\nNous restons à votre disposition pour toute question.\n\nCordialement,`,
  );
  const [mailPending, startMail] = useTransition();
  const [contactPending, startContact] = useTransition();
  // Le devis démarre VIDE : la pergola vient du configurateur, les extras du
  // catalogue. Plus de ligne pré-remplie (qui prêtait à confusion).
  const [lines, setLines] = useState<Line[]>([]);

  // Devis existant : charge ses lignes + son PDF.
  useEffect(() => {
    if (!quoteId) return;
    getDevisLines(quoteId).then((r) => {
      if (r.ok && r.lines?.length) setLines(ordonner(r.lines as Line[]));
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
    setLines((ls) => ls.filter((_, j) => j !== i));

  // Après un rechargement Pennylane, les lignes perdent le drapeau `config` :
  // on le remet en comparant aux désignations que produit la config courante.
  const retag = (ls: Line[]): Line[] => {
    if (!smConfig) return ls;
    const gen = new Set(
      construireLignesDevis(smConfig, surMesureDescriptions).map((l) => l.designation),
    );
    return ls.map((l) => (gen.has(l.designation) ? { ...l, config: true } : l));
  };

  // Applique la config : REMPLACE toutes les lignes du configurateur (kit +
  // options) par les nouvelles, en tête. Les lignes libres/catalogue sont gardées.
  const appliquerConfig = (ls: Line[], cfg: ConfigSM) => {
    setSmConfig(cfg);
    setLines((cur) => ordonner([...ls, ...cur.filter((l) => !l.config)]));
  };

  // Ajoute une ligne à partir d'une option du catalogue (nom + prix + description).
  const addCatalogue = (p: ProduitCatalogueDTO) =>
    setLines((ls) => [
      ...ls,
      {
        designation: p.nom,
        description: p.description ?? null,
        quantite: 1,
        prixHt: p.prixHt || 0,
        tva: p.tva || 20,
      },
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
          if (fresh.ok && fresh.lines?.length)
            setLines(ordonner(retag(fresh.lines as Line[])));
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

        {/* Action principale : configurer la pergola (le configurateur) */}
        <button
          type="button"
          onClick={() => setSmOpen((v) => !v)}
          className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors ${
            smOpen
              ? "border border-primary bg-primary/10 text-primary"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          }`}
        >
          <Calculator className="size-4" />
          {smOpen
            ? "Fermer le configurateur"
            : smConfig
              ? "Modifier la pergola"
              : "Configurer la pergola"}
        </button>

        {/* Secondaire : ajouter une option du catalogue (énergie, menuiserie…) */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value=""
            onChange={(e) => {
              const p = catalogue.find((x) => x.id === e.target.value);
              if (p) {
                addCatalogue(p);
                toast.success(`« ${p.nom} » ajouté`);
              }
              e.currentTarget.value = "";
            }}
            disabled={catalogue.length === 0}
            className="h-9 min-w-[14rem] flex-1 rounded-md border border-border bg-white px-2 text-sm outline-none focus:border-primary disabled:opacity-60"
          >
            <option value="">
              {catalogue.length === 0
                ? "Catalogue vide (à remplir dans Réglages)"
                : "+ Ajouter une option du catalogue"}
            </option>
            {catalogue.map((p) => (
              <option key={p.id} value={p.id}>
                {p.categorie ? `[${p.categorie}] ` : ""}
                {p.nom}
                {p.prixHt ? ` — ${eur(p.prixHt)} HT` : ""}
              </option>
            ))}
          </select>
        </div>

        {smOpen ? (
          <SurMesureCalc
            descriptions={surMesureDescriptions}
            initial={smConfig}
            onAjouter={(ls, cfg) => {
              appliquerConfig(ls, cfg);
              setSmOpen(false);
              toast.success(
                `Pergola configurée (${ls.length} ligne${ls.length > 1 ? "s" : ""})`,
              );
            }}
            onClose={() => setSmOpen(false)}
          />
        ) : null}

        {lines.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Aucune ligne pour l&apos;instant.
            <br />
            <span className="text-xs">
              Clique sur <span className="font-semibold text-foreground">
                « Configurer la pergola »
              </span>{" "}
              pour créer le produit principal, ou ajoute une option du catalogue.
            </span>
          </div>
        ) : null}

        {lines.length > 0 ? (
          <div className="hidden grid-cols-[1fr_3.5rem_6rem_5rem_2rem] gap-2 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
            <span>Désignation</span>
            <span className="text-right">Qté</span>
            <span className="text-right">Prix HT</span>
            <span className="text-right">TVA</span>
            <span />
          </div>
        ) : null}

        {lines.map((l, i) => (
          <div key={i} className="space-y-1">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_3.5rem_6rem_5rem_2rem]">
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
              className="flex h-9 items-center justify-center text-muted-foreground hover:text-red-600"
              aria-label="Supprimer la ligne"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          {l.productId ? (
            <p className="px-1 text-[0.7rem] text-muted-foreground">
              Description gérée par le produit Pennylane.
            </p>
          ) : (
            <textarea
              value={l.description ?? ""}
              onChange={(e) => setLine(i, { description: e.target.value })}
              placeholder="Description (apparaît sur le devis)…"
              rows={l.description ? 2 : 1}
              className="w-full resize-y rounded-md border border-border bg-white px-2 py-1.5 text-xs text-muted-foreground outline-none focus:border-primary"
            />
          )}
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
              <button
                type="button"
                onClick={() => setMailOpen((v) => !v)}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                <Mail className="size-3.5" /> Envoyer par email
              </button>
              <button
                type="button"
                disabled={contactPending}
                onClick={() =>
                  startContact(async () => {
                    const r = await creerContactSignataire(leadId);
                    if (r.ok)
                      toast.success(
                        "Contact signataire créé dans Pennylane. Il est maintenant sélectionnable pour la signature.",
                      );
                    else toast.error(r.error ?? "Échec de la création du contact");
                  })
                }
                className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                title="Crée le contact (nom + email) du client dans Pennylane pour pouvoir le choisir comme signataire"
              >
                {contactPending ? (
                  <RefreshCw className="size-3.5 animate-spin" />
                ) : (
                  <User className="size-3.5" />
                )}
                Créer le contact
              </button>
              <button
                type="button"
                onClick={() => ouvrirDans(() => devisSignatureUrl(quoteId))}
                className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                title="Ouvre la page Pennylane pour envoyer le devis en signature (Yousign)"
              >
                <PenLine className="size-3.5" /> Envoyer pour signature
              </button>
            </>
          ) : null}
        </div>

        {/* Envoi du devis par email — via Gmail (adresse Pergolab), PDF en PJ */}
        {quoteId && mailOpen ? (
          <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/[0.03] p-3">
            <div className="text-eyebrow flex items-center gap-1.5 text-primary">
              <Mail className="size-4" /> Envoyer le devis par email
              <span className="ml-auto text-[10px] font-medium normal-case text-muted-foreground">
                PDF en pièce jointe · depuis ton adresse Pergolab
              </span>
            </div>
            <input
              type="email"
              value={mailTo}
              onChange={(e) => setMailTo(e.target.value)}
              placeholder="Email du client"
              className="h-9 w-full rounded-md border border-border bg-white px-2 text-sm outline-none focus:border-primary"
            />
            <input
              type="text"
              value={mailSubject}
              onChange={(e) => setMailSubject(e.target.value)}
              placeholder="Objet"
              className="h-9 w-full rounded-md border border-border bg-white px-2 text-sm outline-none focus:border-primary"
            />
            <textarea
              value={mailBody}
              onChange={(e) => setMailBody(e.target.value)}
              rows={5}
              className="w-full resize-y rounded-md border border-border bg-white px-2 py-1.5 text-sm outline-none focus:border-primary"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={mailPending || !mailTo.trim()}
                onClick={() =>
                  startMail(async () => {
                    const r = await sendDevisParGmail(leadId, quoteId, numero, {
                      to: mailTo,
                      subject: mailSubject,
                      body: mailBody,
                    });
                    if (r.ok) {
                      toast.success(`Devis envoyé à ${mailTo}`);
                      setMailOpen(false);
                      router.refresh();
                    } else toast.error(r.error ?? "Échec de l'envoi");
                  })
                }
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {mailPending ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Envoyer
              </button>
              <button
                type="button"
                onClick={() => setMailOpen(false)}
                className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" /> Annuler
              </button>
            </div>
          </div>
        ) : null}
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
