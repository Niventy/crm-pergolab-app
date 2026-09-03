"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, FileText, Download, ExternalLink, RefreshCw, Calculator, PenLine, Mail, Send, X, User, Copy } from "lucide-react";
import { toast } from "sonner";
import { formatEuros } from "@/lib/format";
import { SurMesureCalc } from "./sur-mesure-calc";
import { MODELES, FACES, construireLigneUnique, type ConfigSM } from "./sur-mesure";
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
  dupliquerDevis,
} from "../../actions";

type Line = {
  id?: number | null; // id de la ligne côté Pennylane (absent = ligne à créer)
  designation: string;
  description?: string | null;
  quantite: number;
  prixHt: number;
  tva: number;
  productId?: number | null;
  remisePct?: number | null; // remise en % sur la ligne (ex. 10 = -10%)
  config?: boolean; // ligne issue du configurateur (kit ou option)
  suppKey?: number; // pergola supplémentaire : clé du configurateur d'origine
};
// Pennylane ne gère pas de TVA à 0 % (taux mini FR_1_05) → on ne propose que
// les taux valides. Un 0 € (ex. clause) passe en 20 % côté Pennylane sans effet.
const TVA_OPTIONS = [20, 10, 5.5];

// La clause suspensive est gérée à part (ligne fixe « Incluse ») : on ne l'affiche
// pas dans les lignes éditables pour éviter un doublon quand Pennylane la renvoie.
const estClause = (l: Line) =>
  l.designation.trim().toLowerCase().startsWith("clause suspensive");

// Remise commerciale globale : ligne dédiée (montant négatif) gérée par un champ
// à part, placée en fin de devis (avant la clause).
const REMISE_LABEL = "Remise commerciale";
const estRemise = (l: Line) =>
  l.designation.trim().toLowerCase().startsWith("remise commerciale");

// Reconnaît une ligne issue du CONFIGURATEUR (kit pergola « Pergola <Gamme> … »
// ou option posée « <Option> — <Face> (…) ») à partir de son libellé. Nécessaire
// car Pennylane ne renvoie pas le drapeau `config` : sans ça, en reconfigurant un
// devis existant, l'ancienne pergola reste en double (jamais supprimée).
const GAMME_RE = new RegExp(
  `^Pergola\\s+(${MODELES.map(
    (m) => m.code.charAt(0) + m.code.slice(1).toLowerCase(),
  ).join("|")})`,
  "i",
);
const FACE_RE = new RegExp(
  ` — (${FACES.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}) \\(`,
);
// Ne tague `config` (= réconfigurable, remplacé à la reconfiguration) que la
// 1ʳᵉ pergola et ses options. Une 2ᵉ pergola (kit suivant) est laissée telle
// quelle pour survivre à une reconfiguration de la première.
const taguerConfig = (ls: Line[]): Line[] => {
  let kitVu = false;
  return ls.map((l) => {
    const d = l.designation.trim();
    if (GAMME_RE.test(d)) {
      if (!kitVu) {
        kitVu = true;
        return { ...l, config: true };
      }
      return { ...l, config: false };
    }
    if (FACE_RE.test(d)) return { ...l, config: true };
    return l;
  });
};
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
  // Le configurateur est le SEUL moyen de créer la pergola : sur un nouveau
  // devis, on l'ouvre directement (inutile de cliquer « Configurer »).
  const [smOpen, setSmOpen] = useState(!quoteId);
  // Config du configurateur, conservée tant que le devis est ouvert (pour
  // rouvrir sans tout ressaisir et pour remplacer proprement ses lignes).
  const [smConfig, setSmConfig] = useState<ConfigSM | null>(null);
  // Pergolas SUPPLÉMENTAIRES : chacune a son propre configurateur (config
  // indépendante) et produit UNE ligne combinée, identifiée par sa clé.
  const [supplements, setSupplements] = useState<
    { key: number; cfg: ConfigSM | null }[]
  >([]);
  const suppKeyRef = useRef(1);
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
  const [dupPending, startDup] = useTransition();
  // Le devis démarre VIDE : la pergola vient du configurateur, les extras du
  // catalogue. Plus de ligne pré-remplie (qui prêtait à confusion).
  const [lines, setLines] = useState<Line[]>([]);
  // Remise commerciale globale, en % du HT des lignes (ligne à -montant).
  const [remisePct, setRemisePct] = useState(0);

  // Applique des lignes chargées : extrait la remise commerciale (champ à part,
  // reconvertie en % du HT des autres lignes) et retire sa ligne de la liste.
  const appliquerChargement = (raw: Line[]) => {
    const rems = raw.filter(estRemise);
    const autres = raw.filter((l) => !estRemise(l));
    const htAutres = autres.reduce((a, l) => {
      const b = (l.quantite || 0) * (l.prixHt || 0);
      const r = Number(l.remisePct ?? 0);
      return a + (r > 0 ? b * (1 - r / 100) : b);
    }, 0);
    // La remise commerciale peut être répartie sur plusieurs lignes (une par taux
    // de TVA) : on somme toutes ces lignes pour retrouver le % global.
    const remAbs = rems.reduce((a, r) => a + Math.abs(r.prixHt || 0), 0);
    setRemisePct(
      remAbs > 0 && htAutres > 0
        ? Math.round((remAbs / htAutres) * 1000) / 10
        : 0,
    );
    setLines(ordonner(taguerConfig(autres)));
  };

  // Devis existant : charge ses lignes + son PDF.
  useEffect(() => {
    if (!quoteId) return;
    getDevisLines(quoteId).then((r) => {
      if (r.ok && r.lines?.length) appliquerChargement(r.lines as Line[]);
    });
    devisPdfUrl(quoteId).then((r) => {
      if (r.ok && r.url) setPdfUrl(r.url);
    });
  }, [quoteId]);

  // Pennylane régénère le PDF de façon asynchrone après une modif : on laisse un
  // délai avant de recharger l'aperçu, sinon on récupère l'ancien PDF.
  function rafraichirPdf(delayMs = 0) {
    if (!quoteId) return;
    setPdfLoading(true);
    const run = () =>
      devisPdfUrl(quoteId).then((r) => {
        if (r.ok && r.url) {
          setPdfUrl(r.url);
          setPdfKey((k) => k + 1); // change aussi le cache-buster de l'iframe
        } else toast.error(r.error ?? "PDF indisponible");
        setPdfLoading(false);
      });
    if (delayMs > 0) setTimeout(run, delayMs);
    else run();
  }

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const addLine = () =>
    setLines((ls) => [...ls, { designation: "", quantite: 1, prixHt: 0, tva: 20 }]);
  const removeLine = (i: number) =>
    setLines((ls) => ls.filter((_, j) => j !== i));


  // Applique la config : REMPLACE toutes les lignes du configurateur (kit +
  // options) par les nouvelles, en tête. Les lignes libres/catalogue sont gardées.
  const appliquerConfig = (ls: Line[], cfg: ConfigSM) => {
    setSmConfig(cfg);
    setLines((cur) => ordonner([...ls, ...cur.filter((l) => !l.config)]));
  };

  // Ouvre un configurateur supplémentaire (pergola avec sa propre config).
  const ajouterConfigurateurSupplement = () => {
    setSupplements((s) => [...s, { key: suppKeyRef.current++, cfg: null }]);
    toast.success("2ᵉ configurateur ajouté — configure cette pergola");
  };

  // Applique la config d'une pergola supplémentaire : UNE ligne combinée,
  // identifiée par sa clé (remplace la précédente ligne de cette pergola).
  const appliquerSupplement = (key: number, cfg: ConfigSM) => {
    const ligne = construireLigneUnique(cfg, surMesureDescriptions);
    setSupplements((s) => s.map((x) => (x.key === key ? { ...x, cfg } : x)));
    setLines((cur) =>
      ordonner([
        ...cur.filter((l) => l.suppKey !== key),
        ...ligne.map((l) => ({ ...l, config: false, suppKey: key })),
      ]),
    );
    toast.success(
      ligne.length ? "Pergola supplémentaire ajoutée" : "Configure la pergola",
    );
  };

  // Retire un configurateur supplémentaire + sa ligne.
  const retirerSupplement = (key: number) => {
    setSupplements((s) => s.filter((x) => x.key !== key));
    setLines((cur) => cur.filter((l) => l.suppKey !== key));
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
  // HT d'une ligne, remise (%) déduite.
  const netLigne = (l: Line) => {
    const brut = (l.quantite || 0) * (l.prixHt || 0);
    const r = Number(l.remisePct ?? 0);
    return r > 0 ? brut * (1 - r / 100) : brut;
  };
  const brut = lines.reduce((a, l) => a + (l.quantite || 0) * (l.prixHt || 0), 0);
  const htLignes = lines.reduce((a, l) => a + netLigne(l), 0);
  // Remise commerciale globale = % du HT des lignes.
  const remiseMontant = remisePct > 0 ? htLignes * (remisePct / 100) : 0;
  const ht = htLignes - remiseMontant;
  const remiseTotale = brut - ht; // remises par ligne + remise commerciale

  // Net HT des lignes réparti PAR TAUX de TVA (base sur laquelle la remise
  // commerciale s'applique proportionnellement, à chaque taux).
  const netParTaux = (base: Line[]): Map<number, number> => {
    const m = new Map<number, number>();
    for (const l of base) {
      const net = netLigne(l);
      if (net <= 0) continue;
      const t = l.tva || 0;
      m.set(t, (m.get(t) ?? 0) + net);
    }
    return m;
  };

  // Lignes de remise commerciale : UNE par taux de TVA présent, au MÊME taux que
  // les produits réduits (sinon la TVA totale est fausse quand les taux diffèrent).
  const construireRemises = (base: Line[]): Line[] => {
    if (remisePct <= 0) return [];
    const m = netParTaux(base);
    const taux = [...m.keys()].filter((t) => (m.get(t) ?? 0) > 0);
    const multi = taux.length > 1;
    return taux.map((t) => ({
      designation: multi
        ? `${REMISE_LABEL} (TVA ${String(t).replace(".", ",")} %)`
        : REMISE_LABEL,
      quantite: 1,
      prixHt: -Math.abs((m.get(t) ?? 0) * (remisePct / 100)),
      tva: t,
    }));
  };

  // TVA de la remise, retirée AU TAUX de chaque part (et non forfaitairement 20 %).
  const remiseTvaAmt =
    remisePct > 0
      ? [...netParTaux(lines).entries()].reduce(
          (a, [t, net]) => a + net * (remisePct / 100) * (t / 100),
          0,
        )
      : 0;
  const tvaAmt =
    lines.reduce((a, l) => a + netLigne(l) * ((l.tva || 0) / 100), 0) -
    remiseTvaAmt;
  const ttc = ht + tvaAmt;

  function enregistrer() {
    const base = remplies();
    if (!base.length) {
      toast.error("Ajoute au moins une désignation.");
      return;
    }
    // Injecte la remise commerciale en ligne(s) — une par taux de TVA — si
    // renseignée, pour que la TVA soit retirée au bon taux.
    const utiles: Line[] =
      remiseMontant > 0 ? [...base, ...construireRemises(base)] : base;
    start(async () => {
      if (quoteId && devisId) {
        const r = await modifierDevis(leadId, devisId, quoteId, utiles);
        if (r.ok) {
          toast.success("Devis mis à jour");
          // Recharge les lignes : les nouvelles récupèrent leur id Pennylane
          // (sinon un 2e enregistrement les recréerait en double).
          const fresh = await getDevisLines(quoteId);
          if (fresh.ok && fresh.lines?.length)
            appliquerChargement(fresh.lines as Line[]);
          // Laisse Pennylane régénérer le PDF avant de recharger l'aperçu.
          rafraichirPdf(2500);
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

        {/* ÉTAPE 1 — Configurer la pergola : c'est le cœur du devis, affiché
            directement. Sur un devis déjà créé on peut le replier/rouvrir, mais
            sans bouton « Fermer » : un simple lien « Modifier la pergola ». */}
        {smOpen ? (
          <>
          <SurMesureCalc
            descriptions={surMesureDescriptions}
            initial={smConfig}
            catalogue={catalogue}
            titre="1 · Configurer la pergola"
            onNouvellePergola={ajouterConfigurateurSupplement}
            onAjouterProduit={(p) => {
              addCatalogue(p);
              toast.success(`« ${p.nom} » ajouté au devis`);
            }}
            onAjouter={(ls, cfg) => {
              appliquerConfig(ls, cfg);
              toast.success(
                `Pergola ${smConfig ? "mise à jour" : "ajoutée"} (${ls.length} ligne${
                  ls.length > 1 ? "s" : ""
                })`,
              );
            }}
          />
          {/* Pergolas supplémentaires : un configurateur indépendant chacune */}
          {supplements.map((sup, i) => (
            <SurMesureCalc
              key={sup.key}
              descriptions={surMesureDescriptions}
              initial={sup.cfg}
              titre={`${i + 2} · Pergola supplémentaire`}
              ctaLabel={sup.cfg ? "Mettre à jour cette pergola" : "Ajouter cette pergola"}
              onClose={() => retirerSupplement(sup.key)}
              onAjouter={(_ls, cfg) => appliquerSupplement(sup.key, cfg)}
            />
          ))}
          </>
        ) : (
          <button
            type="button"
            onClick={() => setSmOpen(true)}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Calculator className="size-4" />
            {smConfig ? "Modifier la pergola" : "Configurer la pergola"}
          </button>
        )}

        {/* ÉTAPE 2 — Lignes du devis (pergola + options + produits) */}
        <div className="text-eyebrow border-t border-border pt-3 text-muted-foreground">
          2 · Lignes du devis
        </div>

        {lines.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            Configure la pergola (étape 1) puis ajoute des options : les lignes
            apparaîtront ici, éditables avant la création du devis.
          </p>
        ) : null}

        {lines.length > 0 ? (
          <div className="hidden grid-cols-[1fr_3.5rem_6rem_4rem_5rem_2rem] gap-2 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
            <span>Désignation</span>
            <span className="text-right">Qté</span>
            <span className="text-right">Prix HT</span>
            <span className="text-right">Remise %</span>
            <span className="text-right">TVA</span>
            <span />
          </div>
        ) : null}

        {lines.map((l, i) =>
          estClause(l) ? null : (
          <div key={i} className="space-y-1">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_3.5rem_6rem_4rem_5rem_2rem]">
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
            <input
              type="number"
              min={0}
              max={100}
              step="1"
              value={l.remisePct ?? ""}
              onChange={(e) =>
                setLine(i, {
                  remisePct: e.target.value === "" ? null : Number(e.target.value),
                })
              }
              placeholder="0"
              className="h-9 rounded-md border border-border bg-white px-2 text-right text-sm outline-none focus:border-primary"
              aria-label="Remise %"
              title="Remise en % sur cette ligne (ex. 10 = -10%)"
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
          ),
        )}

        <button
          type="button"
          onClick={addLine}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <Plus className="size-3.5" /> Ajouter une ligne libre
        </button>

        {/* Clause suspensive : TOUJOURS incluse (ajoutée à 0 € sur le devis
            Pennylane), non supprimable. Affichée ici pour la visibilité. */}
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/[0.04] px-3 py-2">
          <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
            Incluse
          </span>
          <span className="flex-1 text-sm text-foreground">
            Clause suspensive – faisabilité technique
            <span className="ml-1 text-xs text-muted-foreground">
              · toujours ajoutée au devis
            </span>
          </span>
          <span className="text-sm font-medium tabular-nums text-muted-foreground">
            0 €
          </span>
        </div>

        {/* Remise commerciale (globale) : ligne à -montant, avant la clause. */}
        <div className="flex items-center gap-2 rounded-lg border border-orange-300 bg-orange-50/60 px-3 py-2">
          <span className="flex-1 text-sm text-foreground">
            Remise commerciale
            <span className="ml-1 text-xs text-muted-foreground">
              · geste commercial, en bas du devis
            </span>
          </span>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">−</span>
            <input
              type="number"
              min={0}
              max={100}
              step="0.5"
              value={remisePct || ""}
              onChange={(e) =>
                setRemisePct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))
              }
              placeholder="0"
              className="h-9 w-20 rounded-md border border-border bg-white px-2 text-right text-sm outline-none focus:border-primary"
              aria-label="Remise commerciale en pourcent"
            />
            <span className="text-sm text-muted-foreground">
              % {remiseMontant > 0 ? `(−${eur(remiseMontant)})` : ""}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-0.5 border-t border-border pt-2 text-sm">
          {remiseTotale > 0.005 ? (
            <>
              <div className="text-muted-foreground">
                Sous-total HT :{" "}
                <span className="tabular-nums text-foreground">{eur(brut)}</span>
              </div>
              <div className="text-orange-700">
                Remise : <span className="tabular-nums">−{eur(remiseTotale)}</span>
              </div>
            </>
          ) : null}
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
                disabled={dupPending}
                onClick={() =>
                  startDup(async () => {
                    const r = await dupliquerDevis(leadId, quoteId);
                    if (r.ok && r.devisId) {
                      toast.success("Devis dupliqué");
                      router.push(`/leads/${leadId}/devis/${r.devisId}`);
                    } else toast.error(r.error ?? "Échec de la duplication");
                  })
                }
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline disabled:opacity-50"
                title="Crée un nouveau devis identique (ex. variante avec / sans options)"
              >
                {dupPending ? (
                  <RefreshCw className="size-3.5 animate-spin" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                Dupliquer
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
              onClick={() => rafraichirPdf()}
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
            // _cb (cache-buster) force le navigateur à recharger le PDF régénéré,
            // le public_file_url Pennylane étant stable d'une version à l'autre.
            src={`${pdfUrl}${pdfUrl.includes("?") ? "&" : "?"}_cb=${pdfKey}#navpanes=0&toolbar=1&view=Fit`}
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
