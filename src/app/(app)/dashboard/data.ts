// Calculs partagés par les 3 pages de pilotage : Dashboard (synthèse),
// Commercial (analyse) et Comptabilité (résultat, admin).
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles as profilesTable } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/current-user";
import { formatEuros } from "@/lib/format";
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

// "YYYY-MM" d'un horodatage de réception.
function ym(d: Date | string): string {
  return (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 7);
}

// [année, mois (0-11), jour] d'un horodatage, dans le fuseau de Paris.
function parisYMD(d: Date | string): [number, number, number] {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d instanceof Date ? d : new Date(d));
  const [y, m, day] = s.split("-").map(Number);
  return [y, m - 1, day];
}

export type StatsParams = { adv?: string; mois?: string };

export async function getStats(sp: StatsParams) {
  const [supabase, allLeads, admin] = await Promise.all([
    createClient(),
    db.query.leads.findMany({ with: { stage: true, responsable: true } }),
    isAdmin(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  // --- Périmètre (responsable) ---
  const scopeSel = sp.adv ?? "all";
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
  const scopes = [
    { value: "all", label: "Toute l'équipe" },
    ...[...respMap.entries()].map(([id, nom]) => ({
      value: id,
      label: id === user?.id ? `${nom} (moi)` : nom,
    })),
  ];

  // --- Période (date de RÉCEPTION du lead) ---
  const moisSel = sp.mois && /^\d{4}-\d{2}$/.test(sp.mois) ? sp.mois : "annee";
  const periodeLabel =
    moisSel === "annee"
      ? `Année ${year}`
      : `${MOIS[Number(moisSel.slice(5)) - 1]} ${year}`;
  const moisActif = moisSel === "annee" ? null : Number(moisSel.slice(5)) - 1;

  const inPeriode = (l: (typeof scoped)[number]) =>
    moisSel === "annee"
      ? ym(l.createdAt).startsWith(String(year))
      : ym(l.createdAt) === moisSel;

  const leads = scoped.filter(inPeriode);

  const periodOptions = [
    { value: "annee", label: `Année ${year}` },
    ...Array.from({ length: month + 1 }, (_, m) => ({
      value: `${year}-${String(m + 1).padStart(2, "0")}`,
      label: `${MOIS[m]} ${year}`,
    })),
  ];

  const sum = (arr: typeof leads, f: (l: (typeof leads)[number]) => number) =>
    arr.reduce((a, l) => a + f(l), 0);

  const won = leads.filter((l) => l.statut === "gagnee");
  const perdu = leads.filter((l) => l.statut === "perdue");
  const enCours = leads.filter((l) => l.statut === "en_cours");

  const ca = sum(won, (l) => num(l.montant));
  const marge = sum(won, (l) => num(l.montant) - num(l.montantAchat));
  const margePct = ca ? Math.round((marge / ca) * 100) : 0;
  const acomptes = sum(won, (l) => num(l.acompte));
  const pipeline = sum(enCours, (l) => num(l.montant));
  const devisEnAttente = enCours.filter((l) => l.stage?.nom === "Devis envoyé");
  const devisMontant = sum(devisEnAttente, (l) => num(l.montant));
  const closing =
    won.length + perdu.length > 0
      ? Math.round((won.length / (won.length + perdu.length)) * 100)
      : 0;
  const panierMoyen = won.length ? ca / won.length : 0;

  const today = now.toISOString().slice(0, 10);
  const in7 = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
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
  const monCa = mesWon.reduce((a, l) => a + num(l.montant), 0);
  const monClosing =
    mesWon.length + mesPerdu.length > 0
      ? Math.round((mesWon.length / (mesWon.length + mesPerdu.length)) * 100)
      : 0;

  const monProfil = user?.id
    ? await db.query.profiles.findFirst({
        where: eq(profilesTable.id, user.id),
        columns: { objectifMensuel: true },
      })
    : null;
  const monObjectif = num(monProfil?.objectifMensuel ?? null);
  const monPct = monObjectif > 0 ? Math.round((monCa / monObjectif) * 100) : 0;

  // --- Séries / graphes ---
  const serie = Array.from({ length: month + 1 }, (_, m) => {
    const key = `${year}-${String(m + 1).padStart(2, "0")}`;
    return {
      mois: MOIS[m],
      valeur: scoped.filter((l) => ym(l.createdAt) === key).length,
    };
  });

  const calMonth = moisActif ?? month;
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
    { label: "Devis envoyés", v: leads.filter((l) => (l.stage?.cycle ?? 1) >= 2).length },
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

  const advMap = new Map<
    string,
    { nom: string; leads: number; ca: number; won: number; perdu: number }
  >();
  for (const l of leads) {
    const nom = l.responsable?.nom ?? l.responsable?.email ?? "Non assigné";
    const a = advMap.get(nom) ?? { nom, leads: 0, ca: 0, won: 0, perdu: 0 };
    a.leads += 1;
    if (l.statut === "gagnee") {
      a.won += 1;
      a.ca += num(l.montant);
    }
    if (l.statut === "perdue") a.perdu += 1;
    advMap.set(nom, a);
  }
  const advs = [...advMap.values()].sort((a, b) => b.ca - a.ca);
  const caAdvMax = Math.max(1, ...advs.map((a) => a.ca));

  // --- Marge par produit (gamme) : uniquement sur le CA réalisé (signés) ---
  const prodMap = new Map<
    string,
    { gamme: string; nb: number; ca: number; cout: number }
  >();
  for (const l of won) {
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
    admin, user, year, month,
    scopeSel, scopes, moisSel, moisActif, periodeLabel, periodOptions,
    leads, recus, won, perdu, enCours,
    ca, marge, margePct, acomptes, pipeline, devisEnAttente, devisMontant,
    closing, panierMoyen, rdvAVenir, aRelancer,
    nonAssignes, rdvAReprogrammer, aContacter,
    mesLeads, mesWon, monCa, monClosing, monObjectif, monPct,
    serie, calMonth, calCounts, calMax,
    regionCounts, horsMetropole, funnel, sources, srcMax,
    advs, caAdvMax, margeParProduit,
  };
}
