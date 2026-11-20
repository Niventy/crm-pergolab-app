import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import {
  Building2,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  Mail,
  MessageSquareText,
  Phone,
  ShieldCheck,
} from "lucide-react";
import { db } from "@/db";
import { leads as leadsTable } from "@/db/schema";
import { feuilleDeRoute } from "@/lib/feuille-de-route";
import { devisVisibleClient, factureVisibleClient, resoudreJeton } from "@/lib/espace-client";
import { adresseChantier, type PointValidation } from "@/lib/chantier-validation";
import { validationCourante } from "@/lib/chantier-validation-server";
import { MODES_PAIEMENT } from "@/app/(app)/leads/[id]/paiements-meta";
import { SchemaForm } from "./schema-form";
import { lireSchema } from "@/lib/schema-production";
import { MessageForm } from "./message-form";
import { getInfosEntreprise } from "@/lib/parametres";
import { stockageClientDisponible } from "@/lib/espace-client-config";
import { formatSiret } from "@/lib/infos-entreprise";
import { STAGE } from "@/lib/pipeline";
import {
  formatDate,
  formatEurosCents,
  formatHorodatage,
  formatTelephone,
  telHref,
  todayParis,
  ymdParis,
} from "@/lib/format";

// ESPACE CLIENT — page PUBLIQUE (hors du groupe (app) : pas de nav CRM, pas de
// session). L'accès = le jeton de l'URL, vérifié à chaque requête. On n'affiche
// QUE des données de la fiche du jeton, en lecture seule, sans server action.

export const metadata: Metadata = {
  title: "Votre espace client — Pergolab",
  robots: { index: false, follow: false },
  // Le jeton est dans l'URL : ne jamais le transmettre en Referer (PDF Pennylane…).
  referrer: "no-referrer",
};

function Carte({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {titre}
      </h2>
      {children}
    </section>
  );
}

function Coquille({ children, connecte = false }: { children: React.ReactNode; connecte?: boolean }) {
  return (
    <div className="min-h-full flex-1 bg-slate-50">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-pergolab.png" alt="Pergolab" className="h-8 w-auto" />
          <span className="ml-auto text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Espace client
          </span>
          {connecte ? (
            // Route serveur (efface le cookie) : vraie navigation, pas <Link>.
            // eslint-disable-next-line @next/next/no-html-link-for-pages
            <a
              href="/espace/deconnexion"
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Se déconnecter
            </a>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">{children}</main>
    </div>
  );
}

export default async function EspaceClientPage({
  params,
}: {
  params: Promise<{ jeton: string }>;
}) {
  const { jeton } = await params;
  const leadId = await resoudreJeton(jeton, { compterVisite: true });

  if (!leadId) {
    return (
      <Coquille>
        <Carte titre="Lien indisponible">
          <p className="text-sm text-foreground">
            Ce lien n&apos;est plus valable (il a expiré ou a été remplacé).
            Demandez-en un nouveau à votre conseiller.
          </p>
          <Link
            href="/espace"
            className="mt-3 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Obtenir un nouveau lien
          </Link>
        </Carte>
      </Coquille>
    );
  }

  const [lead, validation, infos] = await Promise.all([
    db.query.leads.findFirst({
      where: eq(leadsTable.id, leadId),
      with: {
        stage: true,
        responsable: true,
        poseurAffecte: true,
        devis: { orderBy: (d, { desc }) => [desc(d.createdAt)] },
        documents: {
          where: (d, { inArray }) => inArray(d.partage, ["client", "a_valider"]),
          orderBy: (d, { desc }) => [desc(d.createdAt)],
        },
        factures: { orderBy: (f, { asc }) => [asc(f.createdAt)] },
        paiements: { orderBy: (p, { asc }) => [asc(p.date), asc(p.createdAt)] },
      },
    }),
    validationCourante(leadId),
    getInfosEntreprise(),
  ]);
  if (!lead) return null;

  const annulee = lead.stage?.code === STAGE.ANNULEE;
  const enSav = lead.stage?.code === STAGE.SAV;

  const devisVisibles = lead.devis.filter(devisVisibleClient);
  const devisSigne = devisVisibles.find((d) => d.accepteAt);
  const autresDevis = devisSigne ? [] : devisVisibles;

  const adressePose = adresseChantier(lead);

  // Règlement : base = TTC du lead UNIQUEMENT (jamais le HT) ; TTC inconnu ⇒
  // ni reste ni « soldé ».
  const ttc = lead.montantTtc != null ? Number(lead.montantTtc) : null;
  const regle = lead.paiements.reduce((t, p) => t + Number(p.montant), 0);
  const reste = ttc != null ? Math.round((ttc - regle) * 100) / 100 : null;
  const facturesVisibles = lead.factures.filter(factureVisibleClient);

  // Feuille de route client (7 étapes déduites des données de la fiche).
  const premier = lead.paiements.find((p) => Number(p.montant) > 0);
  const route = feuilleDeRoute({
    stageCode: lead.stage?.code ?? null,
    devisAccepteLe: (() => {
      const a = lead.devis.find((d) => d.accepteAt)?.accepteAt; // date seule : même sans PDF visible
      return a ? ymdParis(a) : null;
    })(),
    validation: validation
      ? { statut: validation.statut, reponduLe: validation.reponduAt ? ymdParis(validation.reponduAt) : null }
      : null,
    premierPaiement: premier ? { date: premier.date, montant: Number(premier.montant) } : null,
    dateLivraisonPrevue: lead.dateLivraisonPrevue,
    dateLivraisonReelle: lead.dateLivraisonReelle,
    datePosePrevue: lead.datePosePrevue,
    datePoseReelle: lead.datePoseReelle,
    solde: reste != null && reste <= 0,
    resteTtc: reste,
    today: todayParis(),
    fmtDate: formatDate,
    fmtEuros: formatEurosCents,
  });
  const idxRoute = route.findIndex((e) => !e.fait);
  // Contacts joignables seulement (un nom sans téléphone ni email ne sert à rien).
  const contacts = infos.contacts.filter((c) => c.telephone || c.email);
  const modeLabel = (m: string) => MODES_PAIEMENT.find((x) => x.value === m)?.label ?? m;
  // Nom tel que saisi (souvent « dupont jean », en minuscules) → « Dupont Jean ».
  const nomAffiche = lead.nom
    .trim()
    .toLowerCase()
    .replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, l: string) => sep + l.toUpperCase());

  return (
    <Coquille connecte>
      <div className="px-1">
        <h1 className="font-[family-name:var(--font-barlow)] text-2xl font-bold text-foreground">
          Bonjour {nomAffiche},
        </h1>
        <p className="text-sm text-muted-foreground">
          Suivez ici l&apos;avancement de votre projet Pergolab.
          {adressePose ? ` Chantier : ${adressePose}.` : null}
        </p>
      </div>

      {!annulee && validation?.statut === "demandee" ? (
        <section className="rounded-xl border-2 border-primary bg-white p-5 shadow-sm">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-primary">
            <ClipboardCheck className="size-4" /> Action requise : validez votre schéma de production
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Vérifiez votre pergola telle qu&apos;elle sera fabriquée et précisez quelques détails de
            pose. Quelques minutes suffisent : votre validation lance la fabrication.
          </p>
          <SchemaForm
            jeton={jeton}
            validationId={validation.id}
            points={validation.points as PointValidation[]}
            schema={lireSchema(validation.schema)}
            conseiller={lead.responsable?.nom ?? null}
            photosActives={stockageClientDisponible()}
          />
        </section>
      ) : validation?.statut === "validee" ? (
        <section className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <CheckCircle2 className="size-5 shrink-0" />
          <span>
            Vous avez validé votre schéma de production le <b>{formatHorodatage(validation.reponduAt)}</b>.
            Merci !
          </span>
        </section>
      ) : validation?.statut === "a_corriger" ? (
        <section className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <MessageSquareText className="size-5 shrink-0" />
          <span>
            Vos corrections ont été transmises le <b>{formatHorodatage(validation.reponduAt)}</b>.
            Votre conseiller revient vers vous rapidement.
          </span>
        </section>
      ) : null}

      {annulee ? (
        <Carte titre="Votre projet">
          <p className="text-sm">
            Votre commande est indiquée comme annulée. Pour toute question,
            contactez votre conseiller.
          </p>
        </Carte>
      ) : (
        <Carte titre="Avancement">
          <ol>
            {route.map((e, i) => {
              const courant = i === idxRoute;
              return (
                <li key={e.cle} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={
                        "flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold " +
                        (e.fait
                          ? "border-primary bg-primary text-primary-foreground"
                          : courant
                            ? "border-primary bg-white text-primary"
                            : "border-slate-300 bg-white text-slate-400")
                      }
                    >
                      {e.fait ? <Check className="size-3.5" /> : i + 1}
                    </span>
                    {i < route.length - 1 ? (
                      <span className={"w-0.5 flex-1 min-h-4 " + (e.fait ? "bg-primary" : "bg-slate-200")} />
                    ) : null}
                  </div>
                  <div className="pb-4">
                    <p
                      className={
                        "text-sm " +
                        (courant ? "font-bold text-foreground" : e.fait ? "text-foreground" : "text-muted-foreground")
                      }
                    >
                      {e.label}
                    </p>
                    {courant ? <p className="text-xs text-primary">Étape en cours</p> : null}
                    {e.detail ? (
                      <p className={"text-xs " + (courant ? "text-foreground" : "text-muted-foreground")}>{e.detail}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
          {enSav ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Une intervention de service après-vente est en cours sur votre installation.
            </p>
          ) : null}
          {lead.poseurAffecte ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Votre poseur : <span className="font-semibold text-foreground">{lead.poseurAffecte.nom}</span>
            </p>
          ) : null}
        </Carte>
      )}

      {contacts.length ? (
        <Carte titre="Vos contacts">
          <ul className="space-y-3">
            {contacts.map((c) => (
              <li key={c.nom} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{c.nom}</p>
                  {c.role ? <p className="text-xs text-muted-foreground">{c.role}</p> : null}
                </div>
                {c.telephone ? (
                  <a
                    href={telHref(c.telephone)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    <Phone className="size-3.5" /> {formatTelephone(c.telephone)}
                  </a>
                ) : null}
                {c.email ? (
                  <a
                    href={`mailto:${c.email}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                  >
                    <Mail className="size-3.5" /> Email
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </Carte>
      ) : lead.responsable ? (
        <Carte titre="Votre conseiller">
          <p className="text-sm font-semibold">{lead.responsable.nom ?? "Pergolab"}</p>
          {lead.responsable.email ? (
            <a
              href={`mailto:${lead.responsable.email}`}
              className="mt-1 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <Mail className="size-4" /> {lead.responsable.email}
            </a>
          ) : null}
        </Carte>
      ) : null}

      {devisSigne || autresDevis.length ? (
        <Carte titre={devisSigne ? "Votre devis signé" : "Vos devis"}>
          <ul className="divide-y divide-border">
            {(devisSigne ? [devisSigne] : autresDevis).map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                <FileText className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    Devis {d.numero ?? ""}
                    {d.accepteAt ? (
                      <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        Signé
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(ymdParis(d.createdAt))}
                    {d.montantTtc ? ` · ${formatEurosCents(d.montantTtc)} TTC` : null}
                  </p>
                </div>
                <a
                  href={`/espace/${jeton}/devis/${d.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                >
                  Voir le PDF
                </a>
              </li>
            ))}
          </ul>
        </Carte>
      ) : null}

      {ttc != null || lead.paiements.length || facturesVisibles.length ? (
        <Carte titre="Règlement">
          {ttc != null ? (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Total TTC</p>
                  <p className="text-base font-bold">{formatEurosCents(ttc)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Déjà réglé</p>
                  <p className="text-base font-bold text-emerald-700">{formatEurosCents(regle)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Reste à régler</p>
                  <p className="text-base font-bold">
                    {reste != null && reste <= 0 ? (
                      <span className="text-emerald-700">Soldé</span>
                    ) : (
                      formatEurosCents(reste)
                    )}
                  </p>
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-600"
                  style={{ width: `${Math.min(100, ttc > 0 ? (regle / ttc) * 100 : 0)}%` }}
                />
              </div>
            </>
          ) : null}

          {lead.paiements.length ? (
            <ul className="mt-4 divide-y divide-border border-t border-border">
              {lead.paiements.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    {formatDate(p.date)}
                    <span className="text-muted-foreground"> · {modeLabel(p.mode)}</span>
                  </span>
                  <span className="font-semibold">{formatEurosCents(p.montant)}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {facturesVisibles.length ? (
            <div className="mt-4 space-y-2 border-t border-border pt-3">
              <p className="text-xs font-semibold text-muted-foreground">Factures</p>
              {facturesVisibles.map((f) => (
                <div key={f.id} className="flex items-center gap-3">
                  <FileText className="size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-semibold">
                      Facture {f.type === "acompte" ? "d\u2019acompte" : "de solde"} {f.numero ?? ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(ymdParis(f.createdAt))}
                      {f.montantTtc ? ` · ${formatEurosCents(f.montantTtc)} TTC` : null}
                    </p>
                  </div>
                  <a
                    href={`/espace/${jeton}/facture/${f.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                  >
                    Voir le PDF
                  </a>
                </div>
              ))}
            </div>
          ) : null}
        </Carte>
      ) : null}

      {lead.documents.length && stockageClientDisponible() ? (
        <Carte titre="Vos documents">
          <ul className="divide-y divide-border">
            {lead.documents.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                <FileText className="size-5 shrink-0 text-muted-foreground" />
                <p className="min-w-0 flex-1 truncate text-sm font-medium">{d.nom}</p>
                <a
                  href={`/espace/${jeton}/document/${d.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                >
                  <Download className="size-3.5" /> Ouvrir
                </a>
              </li>
            ))}
          </ul>
        </Carte>
      ) : null}

      <Carte titre="Une question, un commentaire ?">
        <MessageForm jeton={jeton} conseiller={lead.responsable?.nom ?? null} />
      </Carte>

      {infos.raisonSociale || infos.siret || infos.assurance || infos.garanties || infos.conditions ? (
        <Carte titre="Votre installateur">
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div>
                {infos.raisonSociale ? <p className="font-semibold">{infos.raisonSociale}</p> : null}
                {infos.adresse ? <p className="text-muted-foreground">{infos.adresse}</p> : null}
                <p className="text-xs text-muted-foreground">
                  {[
                    infos.siret ? `SIRET ${formatSiret(infos.siret)}` : null,
                    infos.tvaIntracom ? `TVA ${infos.tvaIntracom}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {infos.telephone || infos.email || infos.siteWeb ? (
                  <p className="mt-1 flex flex-wrap gap-x-3 text-xs">
                    {infos.telephone ? (
                      <a href={telHref(infos.telephone)} className="text-primary hover:underline">
                        {formatTelephone(infos.telephone)}
                      </a>
                    ) : null}
                    {infos.email ? (
                      <a href={`mailto:${infos.email}`} className="text-primary hover:underline">
                        {infos.email}
                      </a>
                    ) : null}
                    {/^https?:\/\//i.test(infos.siteWeb) ? (
                      <a href={infos.siteWeb} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        {infos.siteWeb.replace(/^https?:\/\//i, "")}
                      </a>
                    ) : null}
                  </p>
                ) : null}
              </div>
            </div>
            {infos.assurance ? (
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-700" />
                <p>{infos.assurance}</p>
              </div>
            ) : null}
            {infos.garanties ? (
              <div className="rounded-lg bg-emerald-50 px-3 py-2">
                <p className="text-xs font-semibold text-emerald-900">Vos garanties</p>
                <p className="whitespace-pre-line text-emerald-950">{infos.garanties}</p>
              </div>
            ) : null}
            {infos.conditions || infos.lienConditions ? (
              <details className="rounded-lg border border-border px-3 py-2">
                <summary className="cursor-pointer text-xs font-semibold">Nos conditions</summary>
                {infos.conditions ? (
                  <p className="mt-2 whitespace-pre-line text-xs text-muted-foreground">{infos.conditions}</p>
                ) : null}
                {infos.lienConditions ? (
                  <a
                    href={infos.lienConditions}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-xs font-semibold text-primary hover:underline"
                  >
                    Conditions générales de vente complètes ↗
                  </a>
                ) : null}
              </details>
            ) : null}
          </div>
        </Carte>
      ) : null}

      <p className="px-1 pt-2 text-center text-xs text-muted-foreground">
        Ce lien est personnel : ne le partagez pas.
      </p>
    </Coquille>
  );
}
