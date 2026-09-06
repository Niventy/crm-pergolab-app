// Calculs partagés par les 3 pages de pilotage : Dashboard (synthèse),
// Commercial (analyse) et Comptabilité (résultat, admin).
//
// RÈGLE : les VOLUMES (leads reçus, closing, entonnoir, sources) se lisent en
// COHORTE — par date de RÉCEPTION du lead. L'ARGENT (CA, marge, panier,
// encaissements, objectifs) se lit par date de SIGNATURE : le CA de septembre
// est ce qui a été signé en septembre, pas ce que donneront un jour les leads
// reçus en septembre.
import { eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { echanges, profiles as profilesTable, leads as leadsTable } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/current-user";
import { formatEuros, ymParis, ymdParis } from "@/lib/format";
import { STAGE } from "@/lib/pipeline";
import { DEPT_TO_REGION } from "./france-geo";

export const MOIS = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
];

export const num = (v: string | null) => Number(v ?? 0);

export function compact(n: number): string {
  return n >= 10000
    ? `${(n / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k€`
    : formatEuros(n);
}

// "YYYY-MM" d'un horodatage de réception, en heure de Paris (pas UTC).
const ym = ymParis;

// [année, mois (0-11), jour] d'un horodatage, dans le fuseau de Paris.
function parisYMD(d: Date | string): [number, number, number] {
  const [y, m, day] = ymdParis(d).split("-").map(Number);
  return [y, m - 1, day];
}

export type StatsParams = { adv?: string; mois?: string };

// Période sélectionnée : « annee » (année en cours, défaut), « YYYY » (une
// année) ou « YYYY-MM » (un mois, de n'importe quelle année).
type Periode = { key: string; year: number; month: number | null; label: string };

function parsePeriode(raw: string | undefined, now: Date): Periode {
  const curY = now.getFullYear();
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const y = Number(raw.slice(0, 4));
    const m = Number(raw.slice(5)) - 1;
    if (m >= 0 && m <= 11) return { key: raw, year: y, month: m, label: `${MOIS[m]} ${y}` };
  }
  if (raw && /^\d{4}$/.test(raw) && Number(raw) !== curY) {
    return { key: raw, year: Number(raw), month: null, label: `Année ${raw}` };
  }
  return { key: "annee", year: curY, month: null, label: `Année ${curY}` };
}

// Une date « YYYY-MM-DD » / « YYYY-MM » est-elle dans la période ?
function dansPeriode(p: Periode, ymOrYmd: string | null | undefined): boolean {
  if (!ymOrYmd) return false;
  return p.month == null
    ? ymOrYmd.startsWith(String(p.year))
    : ymOrYmd.slice(0, 7) === p.key;
}

export async function getStats(sp: StatsParams) {
  const [supabase, allLeads, admin, devisEnvoyesRows] = await Promise.all([
    createClient(),
    db.query.leads.findMany({
      where: isNull(leadsTable.deletedAt),
      with: { stage: true, responsable: true },
    }),
    isAdmin(),
    // Leads pour lesquels un devis a RÉELLEMENT été envoyé (activité).
    db
      .selectDistinct({ leadId: echanges.leadId })
      .from(echanges)
      .where(eq(echanges.type, "devis_envoye")),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const devisEnvoyesIds = new Set(devisEnvoyesRows.map((r) => r.leadId));

  const now = new Date();
  const [curYear, curMonth] = parisYMD(now);
  const periode = parsePeriode(sp.mois, now);
  const { year } = periode;
  const moisActif = periode.month;

  // --- Périmètre (responsable) ---
  // Un MEMBRE (ADV) est verrouillé sur SON propre périmètre : il ne voit jamais
  // le CA / pipeline de l'équipe, et ne peut pas changer de périmètre. Seul un
  // admin peut voir « Toute l'équipe » ou filtrer par ADV.
  const myId = user?.id ?? "none";
  const scopeSel = admin ? (sp.adv ?? "all") : myId;
  const scoped =
    scopeSel === "all"
      ? allLeads
      : scopeSel === "none"
        ? allLeads.filter((l) => !l.assignedTo)
        : allLeads.filter((l) => l.assignedTo === scopeSel);

  const respMap = new Map<string, string>();
  for (const l of allLeads) {
    if (l.assignedTo && l.responsable)
      respMap.set(l.assignedTo, l.responsable.nom ?? l.responsable.email);
  }
  // Sélecteur de périmètre : réservé à l'admin. Vide pour un membre.
  const scopes = admin
    ? [
        { value: "all", label: "Toute l'équipe" },
        ...[...respMap.entries()].map(([id, nom]) => ({
          value: id,
          label: id === user?.id ? `${nom} (moi)` : nom,
        })),
      ]
    : [];

  // --- Options de période : toutes les années présentes (réception OU
  // signature), de la plus récente à la plus ancienne, avec leurs mois. ---
  const annees = new Set<number>([curYear]);
  for (const l of allLeads) {
    annees.add(parisYMD(l.createdAt)[0]);
    if (l.dateSignature) annees.add(Number(l.dateSignature.slice(0, 4)));
  }
  const periodOptions: { value: string; label: string }[] = [];
  for (const y of [...annees].sort((a, b) => b - a)) {
    const courante = y === curYear;
    periodOptions.push({
      value: courante ? "annee" : String(y),
      label: courante ? `Année ${y} (en cours)` : `Année ${y}`,
    });
    const maxM = courante ? curMonth : 11;
    for (let m = maxM; m >= 0; m--)
      periodOptions.push({
        value: `${y}-${String(m + 1).padStart(2, "0")}`,
        label: `${MOIS[m]} ${y}`,
      });
  }

  // --- COHORTE : leads reçus sur la période (volumes) ---
  const inPeriode = (l: (typeof scoped)[number]) => dansPeriode(periode, ym(l.createdAt));
  const leads = scoped.filter(inPeriode);

  const sum = <T,>(arr: T[], f: (l: T) => number) => arr.reduce((a, l) => a + f(l), 0);

  const won = leads.filter((l) => l.statut === "gagnee");
  const perdu = leads.filter((l) => l.statut === "perdue");
  const enCours = leads.filter((l) => l.statut === "en_cours");

  const pipeline = sum(enCours, (l) => num(l.montant));
  const devisEnAttente = enCours.filter((l) => l.stage?.code === STAGE.DEVIS_ENVOYE);
  const devisMontant = sum(devisEnAttente, (l) => num(l.montant));
  const closing =
    won.length + perdu.length > 0
      ? Math.round((won.length / (won.length + perdu.length)) * 100)
      : 0;

  // --- SIGNATURE : commandes signées sur la période (argent) ---
  const signes = scoped.filter(
    (l) => l.statut === "gagnee" && dansPeriode(periode, l.dateSignature),
  );
  const ca = sum(signes, (l) => num(l.montant));
  const marge = sum(signes, (l) => num(l.montant) - num(l.montantAchat));
  const margePct = ca ? Math.round((marge / ca) * 100) : 0;
  const encaisse = sum(signes, (l) => num(l.acompteEncaisse) + num(l.paiementEspece));
  const panierMoyen = signes.length ? ca / signes.length : 0;

  const today = ymdParis(now);
  const in7 = ymdParis(new Date(now.getTime() + 7 * 86400000));
  const rdvAVenir = leads.filter(
    (l) => l.rdvDate && l.rdvDate >= today && l.rdvStatut !== "honore",
  ).length;
  const aRelancer = enCours.filter(
    (l) => l.nextRelanceDate && l.nextRelanceDate <= in7,
  ).length;

  // --- Administratif : ce qui attend un traitement ---
  const nonAssignes = leads.filter((l) => !l.assignedTo).length;
  const rdvAReprogrammer = leads.filter(
    (l) => l.rdvStatut === "a_reprogrammer",
  ).length;
  const aContacter = enCours.filter((l) => !l.datePremierContact).length;

  // --- Mes stats (le connecté) ---
  const mesLeads = allLeads.filter(
    (l) => l.assignedTo === user?.id && inPeriode(l),
  );
  const mesWon = mesLeads.filter((l) => l.statut === "gagnee");
  const mesPerdu = mesLeads.filter((l) => l.statut === "perdue");
  const mesSignes = allLeads.filter(
    (l) =>
      l.assignedTo === user?.id &&
      l.statut === "gagnee" &&
      dansPeriode(periode, l.dateSignature),
  );
  const monCa = sum(mesSignes, (l) => num(l.montant));
  const monClosing =
    mesWon.length + mesPerdu.length > 0
      ? Math.round((mesWon.length / (mesWon.length + mesPerdu.length)) * 100)
      : 0;

  // Objectif MENSUEL : comparé au CA signé du mois affiché (ou du mois en cours
  // si une année est sélectionnée) — plus jamais à un CA annuel.
  const moisObjectif =
    moisActif != null
      ? periode.key
      : `${curYear}-${String(curMonth + 1).padStart(2, "0")}`;
  const objectifLabel =
    moisActif != null ? periode.label : `${MOIS[curMonth]} ${curYear}`;
  const monCaMois = sum(
    allLeads.filter(
      (l) =>
        l.assignedTo === user?.id &&
        l.statut === "gagnee" &&
        (l.dateSignature ?? "").startsWith(moisObjectif),
    ),
    (l) => num(l.montant),
  );
  const monProfil = user?.id
    ? await db.query.profiles.findFirst({
        where: eq(profilesTable.id, user.id),
        columns: { objectifMensuel: true },
      })
    : null;
  const monObjectif = num(monProfil?.objectifMensuel ?? null);
  const monPct = monObjectif > 0 ? Math.round((monCaMois / monObjectif) * 100) : 0;

  // --- Séries / graphes (année de la période) ---
  const nbMois = year === curYear ? curMonth + 1 : 12;
  const serie = Array.from({ length: nbMois }, (_, m) => {
    const key = `${year}-${String(m + 1).padStart(2, "0")}`;
    return {
      mois: MOIS[m],
      valeur: scoped.filter((l) => ym(l.createdAt) === key).length,
    };
  });

  const calMonth = moisActif ?? (year === curYear ? curMonth : 11);
  const calCounts = new Map<number, number>();
  for (const l of scoped) {
    const [yy, mm, dd] = parisYMD(l.createdAt);
    if (yy === year && mm === calMonth)
      calCounts.set(dd, (calCounts.get(dd) ?? 0) + 1);
  }
  const calMax = Math.max(1, ...calCounts.values());

  const regionCounts: Record<string, number> = {};
  let horsMetropole = 0;
  for (const l of leads) {
    const cp = (l.codePostal ?? "").replace(/\D/g, "");
    if (cp.length < 2) {
      horsMetropole++;
      continue;
    }
    let dept = cp.slice(0, 2);
    if (dept === "20") dept = "2A";
    else if (cp.startsWith("97") || cp.startsWith("98")) dept = cp.slice(0, 3);
    const region = DEPT_TO_REGION[dept];
    if (region) regionCounts[region] = (regionCounts[region] ?? 0) + 1;
    else horsMetropole++;
  }

  const recus = leads.length;
  const funnel = [
    { label: "Leads reçus", v: recus },
    { label: "Contactés", v: leads.filter((l) => l.datePremierContact).length },
    { label: "RDV", v: leads.filter((l) => l.rdvDate).length },
    // Devis réellement envoyés (activité), pas « au moins en cycle 2 ».
    { label: "Devis envoyés", v: leads.filter((l) => devisEnvoyesIds.has(l.id)).length },
    { label: "Signés", v: won.length },
  ];

  const srcMap = new Map<string, number>();
  for (const l of leads) {
    const s = l.source ?? "Autre";
    srcMap.set(s, (srcMap.get(s) ?? 0) + 1);
  }
  const sources = [...srcMap.entries()]
    .map(([label, v]) => ({ label, v }))
    .sort((a, b) => b.v - a.v);
  const srcMax = Math.max(1, ...sources.map((s) => s.v));

  // Performance par ADV : leads / closing en cohorte, CA par signature.
  const advMap = new Map<
    string,
    { nom: string; leads: number; ca: number; won: number; perdu: number }
  >();
  const advDe = (l: (typeof scoped)[number]) =>
    l.responsable?.nom ?? l.responsable?.email ?? "Non assigné";
  const advEntry = (nom: string) => {
    const a = advMap.get(nom) ?? { nom, leads: 0, ca: 0, won: 0, perdu: 0 };
    advMap.set(nom, a);
    return a;
  };
  for (const l of leads) {
    const a = advEntry(advDe(l));
    a.leads += 1;
    if (l.statut === "gagnee") a.won += 1;
    if (l.statut === "perdue") a.perdu += 1;
  }
  for (const l of signes) advEntry(advDe(l)).ca += num(l.montant);
  const advs = [...advMap.values()].sort((a, b) => b.ca - a.ca);
  const caAdvMax = Math.max(1, ...advs.map((a) => a.ca));

  // --- Marge par produit (gamme) : sur le CA signé de la période ---
  const prodMap = new Map<
    string,
    { gamme: string; nb: number; ca: number; cout: number }
  >();
  for (const l of signes) {
    const g = l.gamme?.trim() || "Non renseignée";
    const e = prodMap.get(g) ?? { gamme: g, nb: 0, ca: 0, cout: 0 };
    e.nb += 1;
    e.ca += num(l.montant);
    e.cout += num(l.montantAchat);
    prodMap.set(g, e);
  }
  const margeParProduit = [...prodMap.values()]
    .map((p) => ({
      ...p,
      marge: p.ca - p.cout,
      pct: p.ca ? Math.round(((p.ca - p.cout) / p.ca) * 100) : 0,
    }))
    .sort((a, b) => b.marge - a.marge);

  return {
    admin, user, year, month: curMonth,
    scopeSel, scopes, moisSel: periode.key, moisActif,
    periodeLabel: periode.label, periodOptions,
    // cohorte (volumes)
    leads, recus, won, perdu, enCours, pipeline, devisEnAttente, devisMontant,
    closing, rdvAVenir, aRelancer, nonAssignes, rdvAReprogrammer, aContacter,
    // signature (argent)
    signes, ca, marge, margePct, encaisse, panierMoyen,
    // moi
    mesLeads, mesWon, mesSignes, monCa, monClosing,
    monObjectif, monPct, monCaMois, objectifLabel,
    // graphes
    serie, calMonth, calCounts, calMax,
    regionCounts, horsMetropole, funnel, sources, srcMax,
    advs, caAdvMax, margeParProduit,
  };
}
