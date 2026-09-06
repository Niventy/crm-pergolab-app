import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { leads as leadsTable } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/current-user";
import { resolveSender } from "@/lib/email-sender";
import { etatFacturation } from "@/lib/facturation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatEuros,
  formatEurosCents,
  formatDate,
  formatTelephone,
  tempsRelatif,
  humanise,
  todayParis,
} from "@/lib/format";
import {
  computeGaranties,
  GARANTIE_STATUT_LABEL,
  GARANTIE_STRUCTURE_ANS,
  GARANTIE_MOTORISATION_ANS,
  type GarantieStatut,
} from "@/lib/garanties";
import { phaseDe } from "@/app/(app)/clients/phases-meta";
import { assignLead } from "./actions";
import { StageMover } from "./stage-mover";
import { DevisEditor } from "./devis-editor";
import { ActivitePills } from "./activite-pills";
import { ActionsRapides } from "./actions-rapides";
import { EmailCompose } from "./email-compose";
import { EmailThread } from "./email-thread";
import { ChampsEditables } from "./champs-editables";
import { Documents } from "./documents";
import { Facturation } from "./facturation";
import { CorbeilleBanner } from "./corbeille-banner";
import { Chantier } from "./chantier";
import { Paiements } from "./paiements";
import { DossierAdmin } from "./dossier-admin";
import { FicheHeader } from "./fiche-header";
import { NoteComposer } from "./note-composer";
import { handleOf } from "./mentions";
import { FilActivite, type FilItem } from "./fil-activite";
import { MetaReponses, extraireReponsesMeta } from "./meta-reponses";

export const dynamic = "force-dynamic";

const TYPE_POSE_LABEL: Record<string, string> = {
  autoportee: "Autoportée",
  adossee: "Adossée",
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground">{value || "—"}</div>
    </div>
  );
}

// Carte compacte de la colonne Contexte : titre + compteur optionnel.
function Bloc({
  titre,
  compteur,
  id,
  accent,
  children,
}: {
  titre: string;
  compteur?: string | number | null;
  id?: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card id={id} className={accent ? "border-l-4 border-l-primary" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-eyebrow flex items-center gap-2 text-muted-foreground">
          {titre}
          {compteur != null && compteur !== "" ? (
            <span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-bold text-primary">
              {compteur}
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const GARANTIE_CLS: Record<GarantieStatut, string> = {
  active: "bg-green-100 text-green-700",
  bientot: "bg-amber-100 text-amber-700",
  expiree: "bg-red-100 text-red-700",
  inconnue: "bg-slate-100 text-slate-500",
};

export default async function LeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [lead, profiles, stages] = await Promise.all([
    db.query.leads.findFirst({
      where: eq(leadsTable.id, id),
      with: {
        stage: true,
        responsable: true,
        modifiePar: true,
        poseur: true,
        notes: { with: { auteur: true }, orderBy: (n, { desc }) => [desc(n.createdAt)] },
        echanges: { with: { auteur: true }, orderBy: (e, { desc }) => [desc(e.date)] },
        devis: { orderBy: (d, { desc }) => [desc(d.createdAt)] },
        documents: { with: { auteur: true }, orderBy: (d, { desc }) => [desc(d.createdAt)] },
        factures: { orderBy: (f, { asc }) => [asc(f.createdAt)] },
        paiements: {
          with: { auteur: true },
          orderBy: (p, { desc }) => [desc(p.date), desc(p.createdAt)],
        },
      },
    }),
    db.query.profiles.findMany({ orderBy: (p, { asc }) => [asc(p.nom)] }),
    db.query.stages.findMany({ orderBy: (s, { asc }) => [asc(s.position)] }),
  ]);

  if (!lead) notFound();

  const cycle = lead.stage?.cycle ?? 1;
  const admin = await isAdmin();
  // Fiche « client » : signée (gagnée) OU sur une étape de chantier (dont Annulée).
  const isClient = lead.statut === "gagnee" || cycle === 3;
  const today = todayParis();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const connectedEmail = user?.email ?? null;
  const senderFrom = resolveSender(connectedEmail)?.from ?? null;
  const emailConfigured =
    !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET && !!senderFrom;

  // Facturation (client) + autres fiches du même contact (doublons).
  const telDigits = lead.telephone ? lead.telephone.replace(/\D/g, "").replace(/^33/, "0") : null;
  const identites = [
    ...(lead.email ? [sql`lower(${leadsTable.email}) = ${lead.email.toLowerCase()}`] : []),
    ...(telDigits && telDigits.length >= 9
      ? [sql`regexp_replace(regexp_replace(coalesce(${leadsTable.telephone}, ''), '\\D', '', 'g'), '^33', '0') = ${telDigits}`]
      : []),
  ];
  const [facturation, autresFiches] = await Promise.all([
    isClient ? etatFacturation(lead.id) : Promise.resolve(null),
    identites.length
      ? db.query.leads.findMany({
          where: and(ne(leadsTable.id, lead.id), isNull(leadsTable.deletedAt), or(...identites)),
          with: { stage: true, responsable: true },
          orderBy: (l, { desc }) => [desc(l.createdAt)],
          limit: 5,
        })
      : Promise.resolve([]),
  ]);
  const devisAccepte = lead.devis.some((d) => d.accepteAt);
  const choixDevisRequis = isClient && lead.devis.length > 1 && !devisAccepte;
  const devisRef = facturation?.devisRef ?? null;

  // ----- Fil chronologique unique (notes + échanges) -----
  const fil: FilItem[] = [
    ...lead.notes.map((n) => ({
      id: `n-${n.id}`,
      kind: "note" as const,
      type: "note",
      date: n.createdAt,
      auteur: n.auteur?.nom ?? n.auteur?.email ?? null,
      contenu: n.contenu,
    })),
    ...lead.echanges.map((e) => ({
      id: `e-${e.id}`,
      kind: "echange" as const,
      type: e.type,
      date: e.date,
      auteur: e.auteur?.nom ?? e.auteur?.email ?? null,
      contenu: e.contenu ?? "",
    })),
  ];
  const handles = new Set(profiles.map((p) => handleOf(p).toLowerCase()));

  // ----- Bandeau prospection -----
  const appels = lead.echanges.filter((e) => e.type === "appel");
  const contacts = lead.echanges.filter((e) => ["appel", "relance", "email", "rdv", "rdv_honore", "devis_envoye"].includes(e.type));
  const prospection = !isClient
    ? {
        tentatives: appels.length,
        dernierContact: contacts[0]?.date ?? lead.datePremierContact ?? null,
        premierContact: lead.datePremierContact,
        rdv: { date: lead.rdvDate, heure: lead.rdvHeure, type: lead.rdvType, statut: lead.rdvStatut },
        nextRelanceDate: lead.nextRelanceDate,
        relanceCount: lead.relanceCount,
      }
    : null;

  // ----- Bandeau client -----
  const ttc = devisRef?.ttc ?? (lead.montantTtc ? Number(lead.montantTtc) : null);
  const paiementsItems = lead.paiements.map((p) => ({
    id: p.id,
    date: p.date,
    montant: Number(p.montant),
    mode: p.mode,
    reference: p.reference,
    auteur: p.auteur?.nom ?? p.auteur?.email ?? null,
  }));
  const encaisse = paiementsItems.reduce((a, p) => a + p.montant, 0);
  const echeances: { label: string; date: string; Icon: "metre" | "livraison" | "pose" }[] = [];
  if (lead.dateMetre && lead.stage?.code === "a_metrer")
    echeances.push({ label: "Métré", date: lead.dateMetre, Icon: "metre" });
  if (lead.dateLivraisonPrevue && !lead.dateLivraisonReelle)
    echeances.push({ label: "Livraison", date: lead.dateLivraisonPrevue, Icon: "livraison" });
  if (lead.datePosePrevue && !lead.datePoseReelle)
    echeances.push({ label: "Pose", date: lead.datePosePrevue, Icon: "pose" });
  echeances.sort((a, b) => a.date.localeCompare(b.date));
  const clientHeader = isClient
    ? {
        phase: phaseDe({ montantTtc: ttc, acompteEncaisse: encaisse, paiementEspece: 0 }),
        ttc,
        encaisse,
        nbPaiements: paiementsItems.length,
        echeance: echeances[0] ? { ...echeances[0], passe: echeances[0].date < today } : null,
        poseur: lead.poseur?.nom ?? lead.poseur?.email ?? lead.equipePose ?? null,
        devisNumero: devisRef?.numero ?? null,
        dateSignature: lead.dateSignature,
      }
    : null;

  const adresseClient =
    [lead.adresse, [lead.codePostal, lead.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null;
  const soldeFacture = (facturation?.factures ?? []).some(
    (f) => f.type === "solde" && f.statut !== "supprimee",
  );
  const reponsesMeta = extraireReponsesMeta(lead.rawPayload);

  // ----- Blocs -----
  const devisBloc = (
    <Bloc titre="Devis" compteur={lead.devis.length || null}>
      <DevisEditor
        leadId={lead.id}
        devisExistants={lead.devis.map((d) => ({
          id: d.id,
          numero: d.numero,
          montant: d.montant,
          montantTtc: d.montantTtc,
          statut: d.statut,
          lienExterne: d.lienExterne,
          externalId: d.externalId,
          accepte: !!d.accepteAt,
        }))}
        pennylaneConfigured={!!process.env.PENNYLANE_API_KEY}
        choixRequis={choixDevisRequis}
      />
    </Bloc>
  );

  const documentsBloc = (
    <Bloc titre="Documents" compteur={lead.documents.length || null} id="documents">
      <Documents
        leadId={lead.id}
        docs={lead.documents.map((d) => ({
          id: d.id,
          nom: d.nom,
          mime: d.mime,
          taille: d.taille,
          createdAt: d.createdAt,
          auteur: d.auteur?.nom ?? d.auteur?.email ?? null,
        }))}
      />
    </Bloc>
  );

  const emailsBloc =
    emailConfigured && lead.email ? (
      <Bloc titre="Emails (Gmail)">
        <EmailThread leadEmail={lead.email} />
      </Bloc>
    ) : null;

  const autresFichesBloc =
    autresFiches.length > 0 ? (
      <Card className="border-violet-300 bg-violet-50/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-eyebrow text-violet-800">
            Autres fiches de ce contact ({autresFiches.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          {autresFiches.map((a) => (
            <Link
              key={a.id}
              href={`/leads/${a.id}`}
              className="flex flex-wrap items-center gap-2 rounded-md bg-white px-2.5 py-1.5 hover:bg-violet-50"
            >
              <span className="font-medium text-foreground">{a.nom}</span>
              {a.stage ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="size-2 rounded-full" style={{ backgroundColor: a.stage.couleur }} />
                  {a.stage.nom}
                </span>
              ) : null}
              <span className="text-xs text-muted-foreground">
                {a.statut === "gagnee" ? "client" : a.statut === "perdue" ? "perdu" : "en cours"} ·{" "}
                {a.responsable?.nom ?? a.responsable?.email ?? "non assigné"} · reçu {tempsRelatif(a.createdAt)}
              </span>
            </Link>
          ))}
          <p className="text-[11px] text-violet-800/80">
            Même email ou téléphone : vérifie qu&apos;on ne rappelle pas deux fois la même personne.
          </p>
        </CardContent>
      </Card>
    ) : null;

  const origineBloc = (
    <Bloc titre="Origine & historique">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Source" value={lead.source} />
        <Field label="Campagne" value={lead.campagne} />
        <Field
          label="Reçu le"
          value={new Date(lead.createdAt).toLocaleString("fr-FR", {
            dateStyle: "short",
            timeStyle: "short",
            timeZone: "Europe/Paris",
          })}
        />
        <Field
          label="Dernière modification"
          value={
            lead.modifiePar
              ? `${lead.modifiePar.nom ?? lead.modifiePar.email} · ${tempsRelatif(lead.updatedAt)}`
              : tempsRelatif(lead.updatedAt) || "—"
          }
        />
        {admin ? (
          <>
            <Field label="Coût fournisseur" value={formatEuros(lead.montantAchat)} />
            <Field
              label="Marge"
              value={
                lead.montant && lead.montantAchat ? (
                  <span className="font-medium text-green-700">
                    {formatEuros(Number(lead.montant) - Number(lead.montantAchat))}
                  </span>
                ) : (
                  "—"
                )
              }
            />
          </>
        ) : null}
      </div>
    </Bloc>
  );

  // Produit : dérivé du devis signé (client), sinon saisie.
  const produitBloc =
    isClient || cycle >= 2 ? (
      <Bloc titre={`Produit${devisRef?.numero ? ` · devis ${devisRef.numero}` : ""}`}>
        {devisRef && devisRef.lignes.length ? (
          <ul className="divide-y divide-border text-sm">
            {devisRef.lignes
              .filter((l) => !l.designation.toLowerCase().startsWith("remise"))
              .slice(0, 8)
              .map((l, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="min-w-0 truncate text-foreground">
                    {l.quantite > 1 ? `${l.quantite} × ` : ""}
                    {l.designation}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatEurosCents(l.prixHt * l.quantite)} HT
                  </span>
                </li>
              ))}
          </ul>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Gamme" value={lead.gamme} />
            <Field label="Dimensions" value={lead.dimensions} />
            <Field label="Finition" value={lead.finition} />
            <Field label="Type de pose" value={lead.typePose ? TYPE_POSE_LABEL[lead.typePose] : "—"} />
            <Field label="Options" value={humanise(lead.options)} />
          </div>
        )}
      </Bloc>
    ) : null;

  const garantiesBloc = isClient
    ? (() => {
        const g = computeGaranties({ datePoseReelle: lead.datePoseReelle, dateSignature: lead.dateSignature });
        return (
          <Bloc titre={lead.datePoseReelle ? `Garanties · pose du ${formatDate(g.depart)}` : "Garanties"}>
            {lead.datePoseReelle ? (
              <div className="space-y-2">
                {[
                  { t: "Structure aluminium", ans: GARANTIE_STRUCTURE_ANS, fin: g.structureFin, st: g.structureStatut },
                  { t: "Motorisation", ans: GARANTIE_MOTORISATION_ANS, fin: g.motorisationFin, st: g.motorisationStatut },
                ].map((x) => (
                  <div key={x.t} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <div>
                      <div className="text-sm font-medium text-foreground">{x.t}</div>
                      <div className="text-xs text-muted-foreground">
                        {x.ans} ans · {x.fin ? `jusqu'au ${formatDate(x.fin)}` : "—"}
                      </div>
                    </div>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${GARANTIE_CLS[x.st]}`}>
                      {GARANTIE_STATUT_LABEL[x.st]}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Démarrent à la pose : structure {GARANTIE_STRUCTURE_ANS} ans · motorisation{" "}
                {GARANTIE_MOTORISATION_ANS} ans.
              </p>
            )}
          </Bloc>
        );
      })()
    : null;

  return (
    <main className="w-full flex-1 px-4 pt-4 pb-28 lg:px-6">
      <div className="mx-auto w-full max-w-[1500px] space-y-4">
        {/* Barre supérieure */}
        <div className="flex items-center justify-between">
          <Link
            href={isClient ? "/clients" : "/kanban"}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {isClient ? "← Clients" : "← Kanban"}
          </Link>
          <Link
            href={`/leads/${lead.id}/modifier`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Tout modifier
          </Link>
        </div>

        {lead.deletedAt ? (
          <CorbeilleBanner leadId={lead.id} deletedAt={lead.deletedAt} admin={admin} />
        ) : null}

        {!lead.assignedTo && !lead.deletedAt ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
            <span className="text-sm font-semibold text-amber-800">⚠ Ce lead n&apos;est pas attribué.</span>
            {user?.id ? (
              <form action={assignLead.bind(null, lead.id, user.id)}>
                <Button type="submit" size="sm" className="bg-amber-600 text-white hover:bg-amber-700">
                  M&apos;attribuer
                </Button>
              </form>
            ) : null}
            <span className="text-xs text-amber-700">ou choisis un responsable dans l&apos;en-tête.</span>
          </div>
        ) : null}

        {choixDevisRequis ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
            <span className="text-sm font-semibold text-amber-800">
              ⚠ {lead.devis.length} devis : lequel a été signé ?
            </span>
            <span className="text-xs text-amber-700">
              Marque-le dans le bloc Devis — il fixe le montant et la base de facturation.
            </span>
          </div>
        ) : null}

        {/* EN-TÊTE : qui, où en est-on, quoi faire */}
        <FicheHeader
          lead={lead}
          stage={lead.stage ? { nom: lead.stage.nom, couleur: lead.stage.couleur, cycle: lead.stage.cycle } : null}
          isClient={isClient}
          today={today}
          prospection={prospection}
          client={clientHeader}
          profiles={profiles}
          currentUserId={user?.id ?? null}
        />

        {/* TRAVAILLER (gauche) · CONTEXTE (droite) */}
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-5">
          {/* ---------------- TRAVAILLER ---------------- */}
          <div className="space-y-4 lg:col-span-3">
            <Card className="border-l-4 border-l-primary">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-foreground">
                  {isClient ? "Faire avancer le chantier" : "Travailler ce prospect"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isClient ? (
                  <>
                    <ActivitePills leadId={lead.id} cycle={3} activites={[]} showTimeline={false} />
                    <p className="-mt-2 text-[11px] text-muted-foreground">
                      Une pilule date le jalon et avance l&apos;étape.
                    </p>
                  </>
                ) : lead.statut === "en_cours" ? (
                  <ActionsRapides
                    leadId={lead.id}
                    rdv={{ date: lead.rdvDate, heure: lead.rdvHeure, type: lead.rdvType, statut: lead.rdvStatut }}
                  />
                ) : null}
                <details className="group rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Changer d&apos;étape manuellement
                    <span className="ml-2 font-normal normal-case tracking-normal">
                      · actuelle : {lead.stage?.nom ?? "—"}
                    </span>
                  </summary>
                  <div className="pt-3">
                    <StageMover
                      leadId={lead.id}
                      stages={stages}
                      currentStageId={lead.stageId}
                      isClient={isClient}
                    />
                  </div>
                </details>
                <EmailCompose
                  leadId={lead.id}
                  nom={lead.nom}
                  email={lead.email}
                  configured={emailConfigured}
                  connectedEmail={connectedEmail}
                  senderFrom={senderFrom}
                />
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-brand">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-foreground">
                  Fil de la fiche
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    notes, appels, RDV, étapes, devis, paiements — tout au même endroit
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <NoteComposer leadId={lead.id} profiles={profiles} currentUserId={user?.id ?? null} />
                <FilActivite
                  items={fil}
                  handles={handles}
                  today={today}
                  recuLe={lead.createdAt}
                  source={lead.source}
                />
              </CardContent>
            </Card>
          </div>

          {/* ---------------- CONTEXTE ---------------- */}
          <div className="space-y-4 lg:col-span-2">
            {autresFichesBloc}

            <Bloc titre={isClient ? "Coordonnées" : "Coordonnées & projet"}>
              <ChampsEditables
                leadId={lead.id}
                champs={
                  isClient
                    ? [
                        { key: "nom", label: "Nom", value: lead.nom, full: true },
                        { key: "telephone", label: "Téléphone", value: lead.telephone, type: "tel", format: formatTelephone },
                        { key: "email", label: "Email", value: lead.email, type: "email" },
                        { key: "adresse", label: "Adresse", value: lead.adresse, full: true },
                        { key: "codePostal", label: "Code postal", value: lead.codePostal },
                        { key: "ville", label: "Ville", value: lead.ville },
                        // Client professionnel : raison sociale + SIRET + TVA → devis / factures.
                        { key: "entreprise", label: "Société (si pro)", value: lead.entreprise },
                        { key: "siret", label: "SIRET", value: lead.siret },
                        { key: "tvaIntracom", label: "N° TVA intracom", value: lead.tvaIntracom },
                      ]
                    : [
                        // Prospect : pas de ville (seul le code postal est fiable) ;
                        // « type de projet » = les dimensions de la pergola demandées.
                        { key: "nom", label: "Nom", value: lead.nom },
                        { key: "entreprise", label: "Société (si pro)", value: lead.entreprise },
                        { key: "siret", label: "SIRET", value: lead.siret },
                        { key: "tvaIntracom", label: "N° TVA intracom", value: lead.tvaIntracom },
                        { key: "telephone", label: "Téléphone", value: lead.telephone, type: "tel", format: formatTelephone },
                        { key: "email", label: "Email", value: lead.email, type: "email" },
                        { key: "codePostal", label: "Code postal", value: lead.codePostal },
                        // Meta envoie les dimensions dans `dimensions` (type_projet reste vide).
                        { key: "dimensions", label: "Dimensions de la pergola", value: lead.dimensions ?? lead.typeProjet },
                        { key: "dateSouhaiteeAppel", label: "Créneau d'appel souhaité", value: lead.dateSouhaiteeAppel },
                        { key: "dateInstallation", label: "Installation souhaitée", value: lead.dateInstallation },
                      ]
                }
              />
            </Bloc>

            {!isClient && reponsesMeta.length > 0 ? (
              <Bloc titre="Autres réponses du formulaire" compteur={reponsesMeta.length}>
                <MetaReponses payload={lead.rawPayload} />
              </Bloc>
            ) : null}

            {isClient ? (
              <>
                <Bloc titre="Chantier — planning & équipe" id="chantier" accent>
                  <Chantier
                    leadId={lead.id}
                    profiles={profiles}
                    adresseClient={adresseClient}
                    values={{
                      dateMetre: lead.dateMetre,
                      dateCommande: lead.dateCommande,
                      dateLivraisonPrevue: lead.dateLivraisonPrevue,
                      dateLivraisonReelle: lead.dateLivraisonReelle,
                      datePosePrevue: lead.datePosePrevue,
                      datePoseReelle: lead.datePoseReelle,
                      poseAssignedTo: lead.poseAssignedTo,
                      equipePose: lead.equipePose,
                      fournisseur: lead.fournisseur,
                      refCommande: lead.refCommande,
                      adressePose: lead.adressePose,
                    }}
                  />
                </Bloc>
                <div id="argent" className="space-y-4">
                  {devisBloc}
                  {facturation ? (
                    <Bloc titre="Factures" compteur={facturation.factures.filter((f) => f.statut !== "supprimee").length || null}>
                      <Facturation
                        leadId={lead.id}
                        pennylaneConfigured={!!process.env.PENNYLANE_API_KEY}
                        etat={facturation}
                      />
                    </Bloc>
                  ) : null}
                  <Bloc titre="Paiements reçus" compteur={paiementsItems.length || null}>
                    <Paiements
                      leadId={lead.id}
                      paiements={paiementsItems}
                      ttc={ttc}
                      echeancier={facturation?.echeancier ?? [40, 40, 20]}
                    />
                  </Bloc>
                  <Bloc titre="Dossier administratif">
                    <DossierAdmin
                      leadId={lead.id}
                      montantTtc={lead.montantTtc}
                      ttcDuDevis={devisRef?.ttc ?? null}
                      financeur={lead.financeur}
                      mesure={lead.mesure}
                      factureSoldeClient={lead.factureSoldeClient}
                      factureSoldePoseur={lead.factureSoldePoseur}
                      dossierDateEnvoi={lead.dossierDateEnvoi}
                      soldeFacture={soldeFacture}
                    />
                  </Bloc>
                </div>
                {documentsBloc}
                {produitBloc}
                {garantiesBloc}
                {emailsBloc}
                {origineBloc}
              </>
            ) : (
              <>
                {devisBloc}
                {produitBloc}
                {documentsBloc}
                {emailsBloc}
                {origineBloc}
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
