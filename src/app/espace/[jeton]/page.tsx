import type { Metadata } from "next";
import { and, asc, eq } from "drizzle-orm";
import { Check, CheckCircle2, ClipboardCheck, Download, FileText, Mail, MessageSquareText } from "lucide-react";
import { db } from "@/db";
import { leads as leadsTable, stages as stagesTable } from "@/db/schema";
import { devisVisibleClient, factureVisibleClient, resoudreJeton } from "@/lib/espace-client";
import { adresseChantier, type PointValidation } from "@/lib/chantier-validation";
import { validationCourante } from "@/lib/chantier-validation-server";
import { MODES_PAIEMENT } from "@/app/(app)/leads/[id]/paiements-meta";
import { ChatValidation } from "./chat-validation";
import { STAGE } from "@/lib/pipeline";
import { formatDate, formatEurosCents, formatHorodatage, ymdParis } from "@/lib/format";

// ESPACE CLIENT — page PUBLIQUE (hors du groupe (app) : pas de nav CRM, pas de
// session). L'accès = le jeton de l'URL, vérifié à chaque requête. On n'affiche
// QUE des données de la fiche du jeton, en lecture seule, sans server action.

export const metadata: Metadata = {
  title: "Votre espace client — Pergolab",
  robots: { index: false, follow: false },
  // Le jeton est dans l'URL : ne jamais le transmettre en Referer (PDF Pennylane…).
  referrer: "no-referrer",
};

// Libellés côté client (les noms d'étapes du CRM sont du jargon interne).
const LIBELLE_CLIENT: Record<string, string> = {
  [STAGE.A_METRER]: "Prise de mesures",
  [STAGE.METRE_REALISE]: "Mesures réalisées",
  [STAGE.COMMANDE_FOURNISSEUR]: "Fabrication",
  [STAGE.EN_LIVRAISON]: "Livraison",
  [STAGE.POSE_PLANIFIEE]: "Pose planifiée",
  [STAGE.POSEE]: "Pergola posée",
  [STAGE.SAV]: "Service après-vente",
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

function Coquille({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full flex-1 bg-slate-50">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-pergolab.png" alt="Pergolab" className="h-8 w-auto" />
          <span className="ml-auto text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Espace client
          </span>
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
            Ce lien n&apos;est plus valable (il a expiré ou a été remplacé). Contactez
            votre conseiller Pergolab pour en recevoir un nouveau.
          </p>
        </Carte>
      </Coquille>
    );
  }

  const [lead, etapesChantier, validation] = await Promise.all([
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
    db
      .select()
      .from(stagesTable)
      .where(and(eq(stagesTable.cycle, 3), eq(stagesTable.isPerdue, false)))
      .orderBy(asc(stagesTable.position)),
    validationCourante(leadId),
  ]);
  if (!lead) return null;

  const annulee = lead.stage?.code === STAGE.ANNULEE;
  // SAV n'apparaît dans la frise que si le chantier y est.
  const enSav = lead.stage?.code === STAGE.SAV;
  const frise = etapesChantier.filter((s) => s.code !== STAGE.SAV || enSav);
  // Fiche encore en « Signée » (passage) ou avant : 1ʳᵉ étape du chantier.
  const idxCourant = Math.max(
    0,
    frise.findIndex((s) => s.id === lead.stageId),
  );

  const devisVisibles = lead.devis.filter(devisVisibleClient);
  const devisSigne = devisVisibles.find((d) => d.accepteAt);
  const autresDevis = devisSigne ? [] : devisVisibles;

  // Une date absente n'affiche « à planifier » que si l'étape correspondante
  // n'est pas encore ATTEINTE (sinon : « métré à planifier » sur un chantier
  // déjà métré) ; atteinte sans date → ligne masquée.
  const passee = (code: string) => {
    const i = frise.findIndex((s) => s.code === code);
    return i >= 0 && i <= idxCourant;
  };
  const dates = [
    { label: "Prise de mesures", valeur: lead.dateMetre, etape: STAGE.METRE_REALISE },
    {
      label: lead.dateLivraisonReelle ? "Livraison" : "Livraison prévue",
      valeur: lead.dateLivraisonReelle ?? lead.dateLivraisonPrevue,
      etape: STAGE.POSE_PLANIFIEE,
    },
    {
      label: lead.datePoseReelle ? "Pose" : "Pose prévue",
      valeur: lead.datePoseReelle ?? lead.datePosePrevue,
      etape: STAGE.POSEE,
    },
  ].filter((d) => d.valeur || !passee(d.etape));
  const adressePose = adresseChantier(lead);

  // Règlement : base = TTC du lead UNIQUEMENT (jamais le HT) ; TTC inconnu ⇒
  // ni reste ni « soldé ».
  const ttc = lead.montantTtc != null ? Number(lead.montantTtc) : null;
  const regle = lead.paiements.reduce((t, p) => t + Number(p.montant), 0);
  const reste = ttc != null ? Math.round((ttc - regle) * 100) / 100 : null;
  const facturesVisibles = lead.factures.filter(factureVisibleClient);
  const modeLabel = (m: string) => MODES_PAIEMENT.find((x) => x.value === m)?.label ?? m;
  // Nom tel que saisi (souvent « dupont jean », en minuscules) → « Dupont Jean ».
  const nomAffiche = lead.nom
    .trim()
    .toLowerCase()
    .replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, l: string) => sep + l.toUpperCase());

  return (
    <Coquille>
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
            <ClipboardCheck className="size-4" /> Action requise : validez votre chantier
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Quelques minutes suffisent. Votre validation déclenche la fabrication.
          </p>
          <ChatValidation
            jeton={jeton}
            validationId={validation.id}
            points={validation.points as PointValidation[]}
            prenom={nomAffiche}
            conseiller={lead.responsable?.nom ?? null}
          />
        </section>
      ) : validation?.statut === "validee" ? (
        <section className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <CheckCircle2 className="size-5 shrink-0" />
          <span>
            Vous avez validé votre chantier le <b>{formatHorodatage(validation.reponduAt)}</b>.
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
          <ol className="space-y-0">
            {frise.map((s, i) => {
              const fait = i < idxCourant || (i === idxCourant && s.code === STAGE.POSEE);
              const courant = i === idxCourant && !fait;
              return (
                <li key={s.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={
                        "flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold " +
                        (fait
                          ? "border-primary bg-primary text-primary-foreground"
                          : courant
                            ? "border-primary bg-white text-primary"
                            : "border-slate-300 bg-white text-slate-400")
                      }
                    >
                      {fait ? <Check className="size-3.5" /> : i + 1}
                    </span>
                    {i < frise.length - 1 ? (
                      <span className={"w-0.5 flex-1 min-h-4 " + (fait ? "bg-primary" : "bg-slate-200")} />
                    ) : null}
                  </div>
                  <div className="pb-4">
                    <p
                      className={
                        "text-sm " +
                        (courant ? "font-bold text-foreground" : fait ? "text-foreground" : "text-muted-foreground")
                      }
                    >
                      {(s.code && LIBELLE_CLIENT[s.code]) || s.nom}
                    </p>
                    {courant ? <p className="text-xs text-primary">Étape en cours</p> : null}
                  </div>
                </li>
              );
            })}
          </ol>

          {dates.length ? (
          <dl className="mt-2 grid gap-2 border-t border-border pt-3 sm:grid-cols-3">
            {dates.map((d) => (
              <div key={d.label}>
                <dt className="text-xs text-muted-foreground">{d.label}</dt>
                <dd className="text-sm font-semibold">
                  {d.valeur ? formatDate(d.valeur) : <span className="font-normal text-muted-foreground">à planifier</span>}
                </dd>
              </div>
            ))}
          </dl>
          ) : null}
          {lead.poseurAffecte ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Votre poseur : <span className="font-semibold text-foreground">{lead.poseurAffecte.nom}</span>
            </p>
          ) : null}
        </Carte>
      )}

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

      {lead.documents.length ? (
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

      {lead.responsable ? (
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

      <p className="px-1 pt-2 text-center text-xs text-muted-foreground">
        Ce lien est personnel : ne le partagez pas.
      </p>
    </Coquille>
  );
}
