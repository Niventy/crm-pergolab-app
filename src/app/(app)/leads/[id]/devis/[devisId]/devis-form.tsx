"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus, Trash2, FileText, Download, ExternalLink, RefreshCw, Calculator, PenLine,
  Mail, Send, X, Copy, Lock, AlertTriangle, Check, ChevronDown, Pencil, Package,
} from "lucide-react";
import { toast } from "sonner";
import { formatEurosCents, formatTelephone } from "@/lib/format";
import {
  TVA_OPTIONS,
  ligneHt as netLigne,
  netParTaux as calcNetParTaux,
  r2,
  tauxDominant,
  tauxLabel,
} from "@/lib/devis-calc";
import { cn } from "@/lib/utils";
import { ouvrirDans } from "@/lib/ouvrir-dans";
import { ChampsEditables } from "../../champs-editables";
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
  dupliquerDevis,
} from "../../actions";

// Ligne du devis. `uid` = clé React STABLE.
type Line = {
  uid: string;
  id?: number | null; // id de la ligne côté Pennylane (absent = ligne à créer)
  designation: string;
  description?: string | null;
  quantite: number;
  prixHt: number;
  tva: number;
  productId?: number | null;
  remisePct?: number | null; // remise en % sur la ligne (rare)
  config?: boolean; // ligne issue du configurateur (kit ou option)
  suppKey?: number; // pergola supplémentaire : clé du configurateur d'origine
};
type LineIn = Omit<Line, "uid"> & { uid?: string };

const newUid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
const withUid = (l: LineIn): Line => ({ ...l, uid: l.uid ?? newUid() });

// Configuration persistée avec le devis (colonne devis.config).
export type DevisConfig = {
  pergola: ConfigSM | null;
  supplements: { key: number; cfg: ConfigSM | null }[];
  tauxDefaut: number;
  remisePct: number;
};

const estClause = (l: LineIn) =>
  l.designation.trim().toLowerCase().startsWith("clause suspensive");
const REMISE_LABEL = "Remise commerciale";
const estRemise = (l: LineIn) =>
  l.designation.trim().toLowerCase().startsWith("remise commerciale");

// Reconnaît une ligne issue du CONFIGURATEUR à partir de son libellé (Pennylane
// ne renvoie pas le drapeau `config`).
const GAMME_RE = new RegExp(
  `^Pergola\\s+(${MODELES.map((m) => m.code.charAt(0) + m.code.slice(1).toLowerCase()).join("|")})`,
  "i",
);
const FACE_RE = new RegExp(
  ` — (${FACES.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}) \\(`,
);
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
const eur = (n: number) => formatEurosCents(r2(n));

function ordonner(ls: Line[]): Line[] {
  const estPergola = (l: Line) => /^Pergola\b/i.test(l.designation.trim());
  return [...ls].sort((a, b) =>
    estPergola(a) === estPergola(b) ? 0 : estPergola(a) ? -1 : 1,
  );
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

// Champ numérique CONTRÔLÉ EN TEXTE (vider, taper « 12, » sans retomber à 0).
function NumInput({
  value,
  onChange,
  min,
  max,
  className,
  placeholder,
  ariaLabel,
  title,
  disabled,
  allowEmpty = false,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  title?: string;
  disabled?: boolean;
  allowEmpty?: boolean;
}) {
  const toText = (v: number | null | undefined) => (v == null ? "" : String(v));
  const [text, setText] = useState(toText(value));
  const [prevValue, setPrevValue] = useState(value);
  const [focused, setFocused] = useState(false);
  if (value !== prevValue) {
    setPrevValue(value);
    if (!focused) setText(toText(value));
  }
  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      title={title}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        if (t.trim() === "") {
          if (allowEmpty) onChange(null);
          return;
        }
        const n = Number(t.replace(",", "."));
        if (Number.isFinite(n)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)));
      }}
      onBlur={() => {
        setFocused(false);
        if (text.trim() === "" && !allowEmpty) {
          onChange(min ?? 0);
          setText(toText(min ?? 0));
        } else setText(toText(value));
      }}
      className={className}
    />
  );
}

// Étapes du cycle de vie d'un devis, pour que l'ADV sache où il en est.
const ETAPES = ["Composer", "Vérifier", "Envoyer", "Signé"] as const;

export function DevisForm({
  leadId,
  devisId,
  quoteId,
  numero,
  statut,
  pennylaneConfigured,
  surMesureDescriptions,
  catalogue,
  client,
  infos,
  config,
  lignesSnapshot,
  verrou,
}: {
  leadId: string;
  devisId: string | null;
  quoteId: string | null;
  numero: string | null;
  /** Brouillon · Envoyé · Signé · Non retenu (affiché dans le fil d'étapes). */
  statut: string | null;
  pennylaneConfigured: boolean;
  surMesureDescriptions: Record<string, string>;
  catalogue: ProduitCatalogueDTO[];
  client: {
    nom: string;
    entreprise: string | null;
    siret: string | null;
    tvaIntracom: string | null;
    email: string | null;
    telephone: string | null;
    adresse: string | null;
    ville: string | null;
    codePostal: string | null;
  };
  infos: Infos;
  config?: DevisConfig | null;
  lignesSnapshot?: LineIn[] | null;
  verrou?: { actif: boolean; motif: string } | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const readOnly = !!verrou?.actif;
  // Configurateur : ouvert d'emblée sur un nouveau devis ; replié (résumé) sinon.
  const [smOpen, setSmOpen] = useState(!quoteId);
  const [smConfig, setSmConfig] = useState<ConfigSM | null>(config?.pergola ?? null);
  const [supplements, setSupplements] = useState<{ key: number; cfg: ConfigSM | null }[]>(
    config?.supplements ?? [],
  );
  const suppKeyRef = useRef((config?.supplements ?? []).reduce((m, s) => Math.max(m, s.key), 0) + 1);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(!!quoteId);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfKey, setPdfKey] = useState(0);
  const [chargement, setChargement] = useState<"pennylane" | "snapshot" | null>(null);
  const [mailOpen, setMailOpen] = useState(false);
  const [mailTo, setMailTo] = useState(client.email ?? "");
  const [mailSubject, setMailSubject] = useState(`Votre devis PERGOLAB${numero ? ` N° ${numero}` : ""}`);
  const [mailBody, setMailBody] = useState(
    `Bonjour ${client.nom},\n\nVeuillez trouver ci-joint votre devis PERGOLAB.\nNous restons à votre disposition pour toute question.\n\nCordialement,`,
  );
  const [mailPending, startMail] = useTransition();
  const [dupPending, startDup] = useTransition();
  const [plusOpen, setPlusOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [remisePct, setRemisePct] = useState(config?.remisePct ?? 0);
  const [tauxDefaut, setTauxDefaut] = useState<number>(config?.tauxDefaut ?? 20);
  // Détails d'une ligne (description, remise) dépliés.
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());

  const appliquerChargement = (raw: LineIn[]) => {
    const rems = raw.filter(estRemise);
    const autres = raw.filter((l) => !estRemise(l)).map(withUid);
    const htAutres = autres.reduce((a, l) => a + netLigne(l), 0);
    const remAbs = rems.reduce((a, r) => a + Math.abs(r.prixHt || 0), 0);
    setRemisePct(remAbs > 0 && htAutres > 0 ? Math.round((remAbs / htAutres) * 1000) / 10 : 0);
    setTauxDefaut(tauxDominant(autres));
    setLines(ordonner(taguerConfig(autres)));
  };

  const changerTauxDefaut = (t: number) => {
    setTauxDefaut(t);
    setLines((ls) => ls.map((l) => ({ ...l, tva: t })));
    if (lines.length) toast.success(`TVA ${tauxLabel(t)} appliquée à toutes les lignes`);
  };

  useEffect(() => {
    if (!quoteId) return;
    let alive = true;
    getDevisLines(quoteId).then((r) => {
      if (!alive) return;
      if (r.ok && r.lines?.length) {
        appliquerChargement(r.lines as LineIn[]);
        setChargement("pennylane");
      } else if (lignesSnapshot?.length) {
        appliquerChargement(lignesSnapshot.filter((l) => !estClause(l)));
        setChargement("snapshot");
        toast.warning("Pennylane ne répond pas : lignes reprises depuis le CRM.");
      } else toast.error(r.error ?? "Lignes du devis indisponibles.");
    });
    devisPdfUrl(quoteId).then((r) => {
      if (!alive) return;
      setPdfLoading(false);
      if (r.ok && r.url) setPdfUrl(r.url);
      else setPdfError(r.error ?? "PDF indisponible");
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId]);

  function rafraichirPdf(delayMs = 0) {
    if (!quoteId) return;
    setPdfLoading(true);
    setPdfError(null);
    const run = () =>
      devisPdfUrl(quoteId).then((r) => {
        if (r.ok && r.url) {
          setPdfUrl(r.url);
          setPdfKey((k) => k + 1);
        } else setPdfError(r.error ?? "PDF indisponible");
        setPdfLoading(false);
      });
    if (delayMs > 0) setTimeout(run, delayMs);
    else run();
  }

  const setLine = (uid: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.uid === uid ? { ...l, ...patch } : l)));
  const addLine = () => {
    const l = withUid({ designation: "", quantite: 1, prixHt: 0, tva: tauxDefaut });
    setLines((ls) => [...ls, l]);
    setOuverts((s) => new Set(s).add(l.uid));
  };
  const removeLine = (uid: string) => setLines((ls) => ls.filter((l) => l.uid !== uid));
  const toggleOuvert = (uid: string) =>
    setOuverts((s) => {
      const n = new Set(s);
      if (n.has(uid)) n.delete(uid);
      else n.add(uid);
      return n;
    });

  const auTauxDefaut = (ls: LineIn[]): Line[] => ls.map((l) => withUid({ ...l, tva: tauxDefaut }));

  const appliquerConfig = (ls: LineIn[], cfg: ConfigSM) => {
    setSmConfig(cfg);
    setLines((cur) => ordonner([...auTauxDefaut(ls), ...cur.filter((l) => !l.config)]));
    setSmOpen(false); // la pergola validée se replie en résumé
  };
  const ajouterConfigurateurSupplement = () => {
    setSupplements((s) => [...s, { key: suppKeyRef.current++, cfg: null }]);
    setSmOpen(true);
  };
  const appliquerSupplement = (key: number, cfg: ConfigSM) => {
    const ligne = construireLigneUnique(cfg, surMesureDescriptions);
    setSupplements((s) => s.map((x) => (x.key === key ? { ...x, cfg } : x)));
    setLines((cur) =>
      ordonner([
        ...cur.filter((l) => l.suppKey !== key),
        ...auTauxDefaut(ligne).map((l) => ({ ...l, config: false, suppKey: key })),
      ]),
    );
    toast.success(ligne.length ? "Pergola supplémentaire ajoutée" : "Configure la pergola");
  };
  const retirerSupplement = (key: number) => {
    setSupplements((s) => s.filter((x) => x.key !== key));
    setLines((cur) => cur.filter((l) => l.suppKey !== key));
  };
  const addCatalogue = (p: ProduitCatalogueDTO) => {
    setLines((ls) => [
      ...ls,
      withUid({
        designation: p.nom,
        description: p.description ?? null,
        quantite: 1,
        prixHt: p.prixHt || 0,
        tva: p.tva || 20,
      }),
    ]);
    toast.success(`« ${p.nom} » ajouté`);
  };

  // ----- Totaux -----
  const remplies = () => lines.filter((l) => l.designation.trim());
  const brut = lines.reduce((a, l) => a + (l.quantite || 0) * (l.prixHt || 0), 0);
  const htLignes = lines.reduce((a, l) => a + netLigne(l), 0);
  const remiseMontant = remisePct > 0 ? htLignes * (remisePct / 100) : 0;
  const ht = htLignes - remiseMontant;
  const remiseTotale = brut - ht;
  const netParTaux = (base: Line[]): Map<number, number> => calcNetParTaux(base);
  const construireRemises = (base: Line[]): Line[] => {
    if (remisePct <= 0) return [];
    const m = netParTaux(base);
    const taux = [...m.keys()].filter((t) => (m.get(t) ?? 0) > 0);
    const multi = taux.length > 1;
    return taux.map((t) =>
      withUid({
        designation: multi ? `${REMISE_LABEL} (TVA ${tauxLabel(t)})` : REMISE_LABEL,
        quantite: 1,
        prixHt: -r2(Math.abs((m.get(t) ?? 0) * (remisePct / 100))),
        tva: t,
      }),
    );
  };
  const remiseTvaAmt =
    remisePct > 0
      ? [...netParTaux(lines).entries()].reduce((a, [t, net]) => a + net * (remisePct / 100) * (t / 100), 0)
      : 0;
  const tvaAmt = lines.reduce((a, l) => a + netLigne(l) * ((l.tva || 0) / 100), 0) - remiseTvaAmt;
  const ttc = ht + tvaAmt;

  const configActuelle = (): DevisConfig => ({ pergola: smConfig, supplements, tauxDefaut, remisePct });
  const versServeur = (ls: Line[]) =>
    ls.map((l) => ({
      id: l.id ?? null,
      designation: l.designation,
      description: l.description ?? null,
      quantite: l.quantite,
      prixHt: l.prixHt,
      tva: l.tva,
      productId: l.productId ?? null,
      remisePct: l.remisePct ?? null,
    }));

  function enregistrer() {
    if (readOnly) return;
    const base = remplies();
    if (!base.length) {
      toast.error("Ajoute au moins une ligne (pergola, produit ou ligne libre).");
      return;
    }
    const utiles: Line[] = remiseMontant > 0 ? [...base, ...construireRemises(base)] : base;
    const cfg = configActuelle();
    start(async () => {
      if (quoteId && devisId) {
        const r = await modifierDevis(leadId, devisId, quoteId, versServeur(utiles), cfg);
        if (r.ok) {
          toast.success("Devis mis à jour — le PDF se régénère");
          const fresh = await getDevisLines(quoteId);
          if (fresh.ok && fresh.lines?.length) appliquerChargement(fresh.lines as LineIn[]);
          rafraichirPdf(2500);
          router.refresh();
        } else toast.error(r.error ?? "Échec de la mise à jour");
      } else {
        const r = await creerDevis(leadId, versServeur(utiles), cfg);
        if (r.ok && r.devisId) {
          toast.success(`Devis ${r.numero ?? ""} créé — vérifie le PDF puis envoie-le`);
          router.replace(`/leads/${leadId}/devis/${r.devisId}`);
        } else toast.error(r.error ?? "Échec de la création");
      }
    });
  }

  const dupliquer = () =>
    startDup(async () => {
      if (!quoteId) return;
      const r = await dupliquerDevis(leadId, quoteId);
      if (r.ok && r.devisId) {
        toast.success("Variante créée à partir de ce devis");
        router.push(`/leads/${leadId}/devis/${r.devisId}`);
      } else toast.error(r.error ?? "Échec de la duplication");
    });

  // ----- Étape du cycle de vie -----
  const etapeIndex = !quoteId
    ? 0
    : readOnly || statut === "Signé" || statut === "Accepté"
      ? 3
      : statut === "Envoyé"
        ? 2
        : 1;

  const inputCls =
    "h-9 rounded-md border border-border bg-white px-2 text-sm outline-none focus:border-primary disabled:bg-muted/40 disabled:text-muted-foreground";

  // Résumé de la pergola configurée (quand le configurateur est replié).
  const resumePergola = (() => {
    if (!smConfig) return null;
    const kit = lines.find((l) => l.config && GAMME_RE.test(l.designation));
    const nbOptions = lines.filter((l) => l.config && !GAMME_RE.test(l.designation)).length;
    const totalConfig = lines.filter((l) => l.config).reduce((a, l) => a + netLigne(l), 0);
    return {
      titre: kit?.designation ?? `Pergola ${smConfig.modele}`,
      detail: `${smConfig.toitL} × ${smConfig.toitW} m · ${smConfig.poteaux} poteau${smConfig.poteaux > 1 ? "x" : ""}${
        smConfig.eclairage ? ` · ${smConfig.eclairage} spot${smConfig.eclairage > 1 ? "s" : ""}` : ""
      }${smConfig.couleur ? ` · ${smConfig.couleur}` : ""}${nbOptions ? ` · ${nbOptions} option${nbOptions > 1 ? "s" : ""}` : ""}`,
      total: totalConfig,
    };
  })();

  // Catalogue groupé par catégorie.
  const categories = [...new Set(catalogue.map((p) => p.categorie ?? "Autre"))];

  return (
    <div className="space-y-4">
      {/* ---- Fil d'étapes : où en est le devis ---- */}
      <ol className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-xs">
        {ETAPES.map((e, i) => {
          const fait = i < etapeIndex;
          const actif = i === etapeIndex;
          return (
            <li key={e} className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full text-[10px] font-bold",
                  fait
                    ? "bg-green-600 text-white"
                    : actif
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {fait ? <Check className="size-3" /> : i + 1}
              </span>
              <span className={cn("font-semibold", actif ? "text-foreground" : fait ? "text-green-700" : "text-muted-foreground")}>
                {e}
              </span>
              {i < ETAPES.length - 1 ? <span className="mx-1 h-px w-6 bg-border" /> : null}
            </li>
          );
        })}
        <span className="ml-auto text-muted-foreground">
          {etapeIndex === 0
            ? "Compose les lignes puis « Créer le devis »"
            : etapeIndex === 1
              ? "Relis le PDF à droite, puis envoie-le au client"
              : etapeIndex === 2
                ? "Envoyé — en attente de signature"
                : "Signé — lecture seule, duplique pour une variante"}
        </span>
      </ol>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[3fr_2fr]">
        {/* ================= COLONNE GAUCHE : COMPOSER ================= */}
        <div className="space-y-4">
          {!pennylaneConfigured ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Pennylane n&apos;est pas configuré (<code>PENNYLANE_API_KEY</code>).
            </p>
          ) : null}
          {readOnly ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-green-600/30 bg-green-50 px-4 py-3 text-sm text-green-800">
              <Lock className="size-4" />
              <span className="font-semibold">Devis verrouillé</span>
              <span className="text-xs">{verrou?.motif}</span>
              <button
                type="button"
                disabled={dupPending}
                onClick={dupliquer}
                className="ml-auto inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {dupPending ? <RefreshCw className="size-3.5 animate-spin" /> : <Copy className="size-3.5" />}
                Dupliquer pour une variante
              </button>
            </div>
          ) : null}
          {chargement === "snapshot" ? (
            <p className="flex items-center gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="size-3.5" /> Lignes reprises depuis le CRM (Pennylane injoignable).
            </p>
          ) : null}

          {/* ---- 1. La pergola ---- */}
          {!readOnly ? (
            <section className="rounded-xl border border-border bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-eyebrow flex items-center gap-1.5 text-primary">
                  <Calculator className="size-4" /> 1 · La pergola
                </h2>
                {smConfig && !smOpen ? (
                  <button
                    type="button"
                    onClick={() => setSmOpen(true)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <Pencil className="size-3.5" /> Modifier
                  </button>
                ) : null}
              </div>
              {smOpen || !smConfig ? (
                <>
                  <SurMesureCalc
                    descriptions={surMesureDescriptions}
                    initial={smConfig}
                    titre={smConfig ? "Modifier la pergola" : "Configurer la pergola"}
                    ctaLabel={smConfig ? "Valider les modifications" : "Valider la pergola"}
                    onNouvellePergola={ajouterConfigurateurSupplement}
                    onAjouter={(ls, cfg) => {
                      appliquerConfig(ls, cfg);
                      toast.success(`Pergola ${smConfig ? "mise à jour" : "ajoutée"} au devis`);
                    }}
                  />
                  {smConfig ? (
                    <button
                      type="button"
                      onClick={() => setSmOpen(false)}
                      className="mt-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Replier sans changer
                    </button>
                  ) : null}
                </>
              ) : resumePergola ? (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/[0.04] px-3 py-2.5">
                  <Check className="size-4 text-green-700" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-foreground">{resumePergola.titre}</div>
                    <div className="text-xs text-muted-foreground">{resumePergola.detail}</div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums">{eur(resumePergola.total)} HT</div>
                </div>
              ) : null}
              {supplements.map((sup, i) => (
                <div key={sup.key} className="mt-3">
                  <SurMesureCalc
                    descriptions={surMesureDescriptions}
                    initial={sup.cfg}
                    titre={`Pergola supplémentaire n° ${i + 2}`}
                    ctaLabel={sup.cfg ? "Valider les modifications" : "Valider cette pergola"}
                    onClose={() => retirerSupplement(sup.key)}
                    onAjouter={(_ls, cfg) => appliquerSupplement(sup.key, cfg)}
                  />
                </div>
              ))}
            </section>
          ) : null}

          {/* ---- 2. Options & produits du catalogue ---- */}
          {!readOnly && catalogue.length > 0 ? (
            <section className="rounded-xl border border-border bg-white p-4">
              <h2 className="text-eyebrow mb-1 flex items-center gap-1.5 text-primary">
                <Package className="size-4" /> 2 · Options &amp; produits
              </h2>
              <p className="mb-3 text-xs text-muted-foreground">
                Clique pour ajouter une ligne au devis (prix et description du catalogue, modifiables ensuite).
              </p>
              <div className="space-y-3">
                {categories.map((cat) => (
                  <div key={cat}>
                    <div className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                      {cat}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {catalogue
                        .filter((p) => (p.categorie ?? "Autre") === cat)
                        .map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => addCatalogue(p)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-2.5 py-1 text-xs font-medium text-foreground hover:border-primary/40 hover:bg-primary/5"
                            title={p.description ?? undefined}
                          >
                            <Plus className="size-3" />
                            {p.nom}
                            <span className="text-muted-foreground">
                              {p.prixHt > 0 ? eur(p.prixHt) : "prix à définir"}
                            </span>
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* ---- 3. Lignes du devis ---- */}
          <section className="rounded-xl border border-border bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2 className="text-eyebrow flex items-center gap-1.5 text-primary">
                <FileText className="size-4" /> {readOnly ? "Lignes du devis" : "3 · Lignes du devis"}
              </h2>
              <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                TVA
                <select
                  value={tauxDefaut}
                  disabled={readOnly}
                  onChange={(e) => changerTauxDefaut(Number(e.target.value))}
                  className="h-8 rounded-md border border-border bg-white px-1.5 text-sm text-foreground outline-none focus:border-primary disabled:bg-muted/40"
                  aria-label="TVA du devis"
                >
                  {TVA_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {tauxLabel(t)}
                    </option>
                  ))}
                </select>
                <span className="hidden sm:inline" title="10 % : rénovation d'un logement de plus de 2 ans (attestation) · 20 % : neuf">
                  · 10 % rénovation / 20 % neuf
                </span>
              </label>
            </div>

            {lines.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-sm text-muted-foreground">
                {quoteId
                  ? "Chargement des lignes…"
                  : "Aucune ligne : valide la pergola (1) ou ajoute un produit (2). Tu peux aussi saisir une ligne libre."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="pb-1.5 pr-2">Désignation</th>
                      <th className="w-14 pb-1.5 pr-2 text-right">Qté</th>
                      <th className="w-28 pb-1.5 pr-2 text-right">PU HT</th>
                      <th className="w-20 pb-1.5 pr-2">TVA</th>
                      <th className="w-28 pb-1.5 pr-2 text-right">Total HT</th>
                      <th className="w-16 pb-1.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lines.map((l) =>
                      estClause(l) ? null : (
                        <LigneRow
                          key={l.uid}
                          l={l}
                          ouvert={ouverts.has(l.uid)}
                          readOnly={readOnly}
                          inputCls={inputCls}
                          onChange={(patch) => setLine(l.uid, patch)}
                          onRemove={() => removeLine(l.uid)}
                          onToggle={() => toggleOuvert(l.uid)}
                        />
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {!readOnly ? (
              <button
                type="button"
                onClick={addLine}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Plus className="size-3.5" /> Ligne libre (prestation, fourniture…)
              </button>
            ) : null}

            {/* Remise + clause + totaux */}
            <div className="mt-4 space-y-2 border-t border-border pt-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-foreground">Remise commerciale</span>
                <span className="text-xs text-muted-foreground">(geste global, en bas du devis)</span>
                <div className="ml-auto flex items-center gap-1">
                  <span className="text-muted-foreground">−</span>
                  <NumInput
                    value={remisePct || null}
                    min={0}
                    max={100}
                    allowEmpty
                    disabled={readOnly}
                    onChange={(v) => setRemisePct(Math.min(100, Math.max(0, v ?? 0)))}
                    placeholder="0"
                    className={cn(inputCls, "w-16 text-right")}
                    ariaLabel="Remise commerciale en pourcent"
                  />
                  <span className="text-muted-foreground">%</span>
                  {remiseMontant > 0 ? (
                    <span className="text-xs text-orange-700">(−{eur(remiseMontant)})</span>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded bg-primary/10 px-1.5 py-0.5 font-bold uppercase tracking-wide text-primary">
                  Incluse
                </span>
                Clause suspensive – faisabilité technique (0 €, ajoutée automatiquement sur le PDF)
              </div>
            </div>
          </section>

          {/* ---- Totaux + action principale (collés en bas de la colonne) ---- */}
          <section className="sticky bottom-4 z-10 rounded-xl border border-primary/30 bg-white p-4 shadow-lg">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-0.5 text-sm">
                {remiseTotale > 0.005 ? (
                  <div className="text-muted-foreground">
                    Sous-total {eur(brut)} · remise <span className="text-orange-700">−{eur(remiseTotale)}</span>
                  </div>
                ) : null}
                <div className="text-muted-foreground">
                  HT <span className="tabular-nums text-foreground">{eur(ht)}</span> · TVA{" "}
                  <span className="tabular-nums text-foreground">{eur(tvaAmt)}</span>
                </div>
                <div className="text-2xl font-bold tabular-nums text-foreground">
                  {eur(ttc)} <span className="text-sm font-semibold text-muted-foreground">TTC</span>
                </div>
              </div>

              <div className="ml-auto flex flex-wrap items-center gap-2">
                {!readOnly ? (
                  <button
                    type="button"
                    onClick={enregistrer}
                    disabled={pending || lines.length === 0}
                    className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {pending ? <RefreshCw className="size-4 animate-spin" /> : <FileText className="size-4" />}
                    {pending ? "Enregistrement…" : quoteId ? "Enregistrer les modifications" : "Créer le devis"}
                  </button>
                ) : null}
                {quoteId ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setMailOpen((v) => !v)}
                      className={cn(
                        "inline-flex h-10 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold",
                        etapeIndex === 1
                          ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                          : "border-border bg-white text-foreground hover:bg-muted",
                      )}
                      title="Envoie le PDF par email depuis ton adresse Pergolab ; la fiche passe « Devis envoyé »"
                    >
                      <Mail className="size-4" /> Envoyer au client
                    </button>
                    {!readOnly ? (
                      <button
                        type="button"
                        onClick={() => ouvrirDans(() => devisSignatureUrl(quoteId, leadId))}
                        className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border bg-white px-3 text-sm font-semibold text-foreground hover:bg-muted"
                        title="Ouvre Pennylane pour envoyer le devis en signature électronique (Yousign). Le contact signataire est créé automatiquement."
                      >
                        <PenLine className="size-4" /> Faire signer
                      </button>
                    ) : null}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setPlusOpen((o) => !o)}
                        className="inline-flex h-10 items-center gap-1 rounded-md border border-border bg-white px-3 text-sm text-foreground hover:bg-muted"
                      >
                        Plus <ChevronDown className={cn("size-4 transition-transform", plusOpen && "rotate-180")} />
                      </button>
                      {plusOpen ? (
                        <div className="absolute right-0 bottom-full z-20 mb-1 w-56 rounded-lg border border-border bg-white p-1 text-sm shadow-lg">
                          <MenuItem onClick={() => { setPlusOpen(false); ouvrirDans(() => devisPdfUrl(quoteId)); }} Icon={Download}>
                            Télécharger le PDF
                          </MenuItem>
                          <MenuItem onClick={() => { setPlusOpen(false); dupliquer(); }} Icon={Copy}>
                            Dupliquer (variante)
                          </MenuItem>
                          <MenuItem onClick={() => { setPlusOpen(false); ouvrirDans(() => devisAppUrl(quoteId)); }} Icon={ExternalLink}>
                            Ouvrir dans Pennylane
                          </MenuItem>
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            {quoteId && mailOpen ? (
              <div className="mt-3 space-y-2 rounded-lg border border-primary/30 bg-primary/[0.03] p-3">
                <div className="text-eyebrow flex items-center gap-1.5 text-primary">
                  <Mail className="size-4" /> Envoyer le devis par email
                  <span className="ml-auto text-[10px] font-medium normal-case text-muted-foreground">
                    PDF en pièce jointe · depuis ton adresse Pergolab · la fiche passe « Devis envoyé »
                  </span>
                </div>
                <input type="email" value={mailTo} onChange={(e) => setMailTo(e.target.value)} placeholder="Email du client" className={cn(inputCls, "w-full")} />
                <input type="text" value={mailSubject} onChange={(e) => setMailSubject(e.target.value)} placeholder="Objet" className={cn(inputCls, "w-full")} />
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
                        const r = await sendDevisParGmail(leadId, quoteId, numero, { to: mailTo, subject: mailSubject, body: mailBody });
                        if (r.ok) {
                          toast.success(`Devis envoyé à ${mailTo}`);
                          setMailOpen(false);
                          router.refresh();
                        } else toast.error(r.error ?? "Échec de l'envoi");
                      })
                    }
                    className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {mailPending ? <RefreshCw className="size-4 animate-spin" /> : <Send className="size-4" />}
                    Envoyer
                  </button>
                  <button type="button" onClick={() => setMailOpen(false)} className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:text-foreground">
                    <X className="size-4" /> Annuler
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </div>

        {/* ================= COLONNE DROITE : CLIENT + APERÇU ================= */}
        <div className="space-y-4">
          <section className="space-y-3 rounded-xl border border-border bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="text-eyebrow text-muted-foreground">Client du devis</span>
              <Link href={`/leads/${leadId}`} className="text-xs font-medium text-primary hover:underline">
                Ouvrir la fiche ↗
              </Link>
            </div>
            {!client.adresse || !client.ville ? (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Adresse de facturation incomplète : renseigne l&apos;adresse et la ville — elles figurent sur le PDF.
              </p>
            ) : null}
            <ChampsEditables
              leadId={leadId}
              champs={[
                { key: "nom", label: "Nom & prénom", value: client.nom, full: true },
                { key: "telephone", label: "Téléphone", value: client.telephone, type: "tel", format: formatTelephone },
                { key: "email", label: "Email", value: client.email, type: "email" },
                { key: "adresse", label: "Adresse", value: client.adresse, full: true },
                { key: "codePostal", label: "Code postal", value: client.codePostal },
                { key: "ville", label: "Ville", value: client.ville },
                // Professionnel : raison sociale + SIRET + TVA → client Pennylane « société ».
                { key: "entreprise", label: "Société (si pro)", value: client.entreprise },
                { key: "siret", label: "SIRET", value: client.siret },
                { key: "tvaIntracom", label: "N° TVA intracom", value: client.tvaIntracom },
              ]}
            />
            {client.entreprise && !client.siret ? (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Client professionnel sans SIRET : il est attendu sur le devis et la facture.
              </p>
            ) : null}
            {infos.dimensions || infos.dateInstallation || infos.rdvDate ? (
              <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
                {infos.dimensions ? <span>Demandé : {infos.dimensions.replace(/_/g, " ")}</span> : null}
                {infos.dateInstallation ? <span>Installation : {infos.dateInstallation.replace(/_/g, " ")}</span> : null}
                {infos.rdvDate ? (
                  <span>
                    RDV {infos.rdvDate.split("-").reverse().join("/")}
                    {infos.rdvHeure ? ` · ${infos.rdvHeure}` : ""}
                  </span>
                ) : null}
              </div>
            ) : null}
          </section>

          {/* Aperçu : PDF Pennylane si créé, sinon récapitulatif vivant */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-eyebrow text-muted-foreground">
                {quoteId ? `Aperçu PDF ${numero ? `· ${numero}` : ""}` : "Aperçu (avant création)"}
              </span>
              {quoteId ? (
                <button
                  type="button"
                  onClick={() => rafraichirPdf()}
                  disabled={pdfLoading}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <RefreshCw className={`size-3.5 ${pdfLoading ? "animate-spin" : ""}`} /> Rafraîchir
                </button>
              ) : null}
            </div>

            {quoteId ? (
              pdfUrl && !pdfError ? (
                <iframe
                  key={pdfKey}
                  src={`${pdfUrl}${pdfUrl.includes("?") ? "&" : "?"}_cb=${pdfKey}#navpanes=0&toolbar=1&view=Fit`}
                  title="Aperçu du devis"
                  className="h-[calc(100vh-14rem)] min-h-[560px] w-full rounded-xl border border-border bg-white"
                />
              ) : (
                <div className="flex h-[calc(100vh-14rem)] min-h-[560px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-6 text-center text-sm text-muted-foreground">
                  {pdfError ? (
                    <>
                      <AlertTriangle className="size-6 text-amber-600" />
                      <div className="font-medium text-foreground">Aperçu indisponible</div>
                      <div className="text-xs">{pdfError}</div>
                      <button
                        type="button"
                        onClick={() => rafraichirPdf()}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                      >
                        <RefreshCw className="size-3.5" /> Réessayer
                      </button>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="size-5 animate-spin" /> Chargement de l&apos;aperçu…
                    </>
                  )}
                </div>
              )
            ) : (
              <Recap client={client} lines={lines} brut={brut} remiseTotale={remiseTotale} ht={ht} tva={tvaAmt} ttc={ttc} />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// Une ligne du tableau + ses détails repliables (description, remise %).
function LigneRow({
  l,
  ouvert,
  readOnly,
  inputCls,
  onChange,
  onRemove,
  onToggle,
}: {
  l: Line;
  ouvert: boolean;
  readOnly: boolean;
  inputCls: string;
  onChange: (patch: Partial<Line>) => void;
  onRemove: () => void;
  onToggle: () => void;
}) {
  const total = netLigne(l);
  const aDetails = !!l.description || (l.remisePct ?? 0) > 0;
  return (
    <>
      <tr className="align-middle">
        <td className="py-1.5 pr-2">
          <input
            value={l.designation}
            disabled={readOnly}
            onChange={(e) => onChange({ designation: e.target.value })}
            placeholder="Désignation…"
            className={cn(inputCls, "w-full", l.config && "font-medium")}
          />
        </td>
        <td className="py-1.5 pr-2">
          <NumInput value={l.quantite} min={1} disabled={readOnly} onChange={(v) => onChange({ quantite: v ?? 1 })} className={cn(inputCls, "w-full text-right")} ariaLabel="Quantité" />
        </td>
        <td className="py-1.5 pr-2">
          <NumInput value={l.prixHt} min={0} disabled={readOnly} onChange={(v) => onChange({ prixHt: v ?? 0 })} className={cn(inputCls, "w-full text-right")} ariaLabel="Prix unitaire HT" />
        </td>
        <td className="py-1.5 pr-2">
          <select
            value={l.tva}
            disabled={readOnly}
            onChange={(e) => onChange({ tva: Number(e.target.value) })}
            className={cn(inputCls, "w-full px-1")}
            aria-label="TVA"
          >
            {TVA_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {tauxLabel(t)}
              </option>
            ))}
          </select>
        </td>
        <td className="py-1.5 pr-2 text-right tabular-nums text-foreground">{eur(total)}</td>
        <td className="py-1.5">
          <div className="flex items-center justify-end gap-0.5">
            <button
              type="button"
              onClick={onToggle}
              className={cn(
                "flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
                (ouvert || aDetails) && "text-primary",
              )}
              title="Description / remise sur la ligne"
              aria-label="Détails de la ligne"
            >
              <ChevronDown className={cn("size-4 transition-transform", ouvert && "rotate-180")} />
            </button>
            {!readOnly ? (
              <button
                type="button"
                onClick={onRemove}
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-600"
                aria-label="Supprimer la ligne"
              >
                <Trash2 className="size-4" />
              </button>
            ) : null}
          </div>
        </td>
      </tr>
      {ouvert ? (
        <tr>
          <td colSpan={6} className="pb-2">
            <div className="grid grid-cols-1 gap-2 rounded-md bg-muted/40 p-2 sm:grid-cols-[1fr_9rem]">
              {l.productId ? (
                <p className="px-1 text-xs text-muted-foreground">Description gérée par le produit Pennylane.</p>
              ) : (
                <textarea
                  value={l.description ?? ""}
                  disabled={readOnly}
                  onChange={(e) => onChange({ description: e.target.value })}
                  placeholder="Description visible sur le devis…"
                  rows={3}
                  className="w-full resize-y rounded-md border border-border bg-white px-2 py-1.5 text-xs outline-none focus:border-primary disabled:bg-muted/40"
                />
              )}
              <label className="text-xs text-muted-foreground">
                Remise sur la ligne (%)
                <NumInput
                  value={l.remisePct ?? null}
                  min={0}
                  max={100}
                  allowEmpty
                  disabled={readOnly}
                  onChange={(v) => onChange({ remisePct: v })}
                  placeholder="0"
                  className={cn(inputCls, "mt-0.5 w-full text-right")}
                  ariaLabel="Remise %"
                />
              </label>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function MenuItem({ onClick, Icon, children }: { onClick: () => void; Icon: typeof Download; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-foreground hover:bg-muted"
    >
      <Icon className="size-4 text-muted-foreground" /> {children}
    </button>
  );
}

// Récapitulatif « comme sur le devis » tant que le PDF n'existe pas : la
// colonne de droite n'est plus vide pendant la composition.
function Recap({
  client,
  lines,
  brut,
  remiseTotale,
  ht,
  tva,
  ttc,
}: {
  client: {
    nom: string;
    entreprise?: string | null;
    siret?: string | null;
    tvaIntracom?: string | null;
    adresse: string | null;
    codePostal: string | null;
    ville: string | null;
  };
  lines: Line[];
  brut: number;
  remiseTotale: number;
  ht: number;
  tva: number;
  ttc: number;
}) {
  const visibles = lines.filter((l) => l.designation.trim() && !estClause(l));
  return (
    <div className="min-h-[560px] rounded-xl border border-border bg-white p-6 text-sm shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-display text-lg text-primary">PERGOLAB</div>
          <div className="text-xs text-muted-foreground">Devis — aperçu</div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          {client.entreprise ? (
            <div className="font-semibold text-foreground">{client.entreprise}</div>
          ) : null}
          <div className={client.entreprise ? "" : "font-semibold text-foreground"}>{client.nom}</div>
          <div>{client.adresse ?? <span className="text-amber-700">adresse à compléter</span>}</div>
          <div>{[client.codePostal, client.ville].filter(Boolean).join(" ")}</div>
          {client.siret ? <div>SIRET {client.siret}</div> : null}
          {client.tvaIntracom ? <div>TVA {client.tvaIntracom}</div> : null}
        </div>
      </div>
      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[0.65rem] uppercase tracking-wide text-muted-foreground">
            <th className="pb-1">Désignation</th>
            <th className="pb-1 text-right">Qté</th>
            <th className="pb-1 text-right">PU HT</th>
            <th className="pb-1 text-right">Total HT</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {visibles.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-8 text-center text-muted-foreground">
                Les lignes apparaîtront ici au fil de la composition.
              </td>
            </tr>
          ) : (
            visibles.map((l) => (
              <tr key={l.uid}>
                <td className="py-1.5 pr-2">
                  <div className="text-foreground">{l.designation}</div>
                  {l.description ? (
                    <div className="line-clamp-2 text-xs text-muted-foreground">{l.description}</div>
                  ) : null}
                </td>
                <td className="py-1.5 text-right tabular-nums">{l.quantite}</td>
                <td className="py-1.5 text-right tabular-nums">{eur(l.prixHt)}</td>
                <td className="py-1.5 text-right tabular-nums">{eur(netLigne(l))}</td>
              </tr>
            ))
          )}
          <tr>
            <td colSpan={3} className="py-1.5 text-xs text-muted-foreground">Clause suspensive – faisabilité technique</td>
            <td className="py-1.5 text-right tabular-nums text-muted-foreground">0,00 €</td>
          </tr>
        </tbody>
      </table>
      <div className="mt-4 ml-auto w-64 space-y-1 border-t border-border pt-2 text-sm">
        {remiseTotale > 0.005 ? (
          <>
            <div className="flex justify-between text-muted-foreground"><span>Sous-total HT</span><span className="tabular-nums">{eur(brut)}</span></div>
            <div className="flex justify-between text-orange-700"><span>Remise</span><span className="tabular-nums">−{eur(remiseTotale)}</span></div>
          </>
        ) : null}
        <div className="flex justify-between"><span>Total HT</span><span className="tabular-nums">{eur(ht)}</span></div>
        <div className="flex justify-between text-muted-foreground"><span>TVA</span><span className="tabular-nums">{eur(tva)}</span></div>
        <div className="flex justify-between text-base font-bold"><span>Total TTC</span><span className="tabular-nums">{eur(ttc)}</span></div>
      </div>
      <p className="mt-6 text-[11px] text-muted-foreground">
        Le PDF officiel (Pennylane) remplacera cet aperçu dès la création du devis : mêmes lignes, échéancier 40 / 40 / 20 et clause suspensive.
      </p>
    </div>
  );
}

