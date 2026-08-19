import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leads as leadsTable } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/current-user";
import { resolveSender } from "@/lib/email-sender";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatEuros, formatDate, tempsRelatif, humanise } from "@/lib/format";
import {
  computeGaranties,
  GARANTIE_STATUT_LABEL,
  GARANTIE_STRUCTURE_ANS,
  GARANTIE_MOTORISATION_ANS,
  type GarantieStatut,
} from "@/lib/garanties";
import { assignLead } from "./actions";
import { AssignSelect } from "./assign-select";
import { StageMover } from "./stage-mover";
import { DevisEditor } from "./devis-editor";
import { ActivitePills } from "./activite-pills";
import { EmailCompose } from "./email-compose";
import { EmailThread } from "./email-thread";
import { Conversation } from "./conversation";
import { EncaissementForm } from "./encaissement-form";
import { ChampsEditables } from "./champs-editables";

export const dynamic = "force-dynamic";

const RDV_TYPE_LABEL: Record<string, string> = {
  physique: "physique",
  visio: "visio",
};
const RDV_STATUT_LABEL: Record<string, string> = {
  prevu: "prévu",
  a_reprogrammer: "à reprogrammer",
  honore: "honoré",
};
const RAISON_PERTE_LABEL: Record<string, string> = {
  prix: "Prix",
  delai: "Délai",
  concurrent: "Concurrent",
  injoignable: "Injoignable",
  annule: "Projet annulé",
  non_qualifie: "Non qualifié",
  autre: "Autre",
};
const MODE_PAIEMENT_LABEL: Record<string, string> = {
  comptant: "Comptant",
  financement_60: "Financement 60 mois",
  financement_120: "Financement 120 mois",
};
const TYPE_POSE_LABEL: Record<string, string> = {
  autoportee: "Autoportée",
  adossee: "Adossée",
};

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground">{value || "—"}</div>
    </div>
  );
}

// Champ mis en avant pour la prise d'info pendant l'appel (gros, lisible).
function BigField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2">
      <div className="text-eyebrow text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold break-words text-foreground">
        {value || "—"}
      </div>
    </div>
  );
}

function StatutBadge({ statut }: { statut: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    en_cours: { label: "En cours", cls: "bg-slate-200 text-slate-700" },
    gagnee: { label: "Gagnée", cls: "bg-green-600 text-white" },
    perdue: { label: "Perdue", cls: "bg-red-600 text-white" },
  };
  const s = map[statut] ?? map.en_cours;
  return (
    <span
      className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${s.cls}`}
    >
      {s.label}
    </span>
  );
}

const GARANTIE_CLS: Record<GarantieStatut, string> = {
  active: "bg-green-100 text-green-700",
  bientot: "bg-amber-100 text-amber-700",
  expiree: "bg-red-100 text-red-700",
  inconnue: "bg-slate-100 text-slate-500",
};

function GarantieLigne({
  titre,
  ans,
  fin,
  statut,
}: {
  titre: string;
  ans: number;
  fin: string | null;
  statut: GarantieStatut;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
      <div>
        <div className="text-sm font-medium text-foreground">{titre}</div>
        <div className="text-xs text-muted-foreground">
          {ans} ans · {fin ? `jusqu'au ${formatDate(fin)}` : "date de départ inconnue"}
        </div>
      </div>
      <span
        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${GARANTIE_CLS[statut]}`}
      >
        {GARANTIE_STATUT_LABEL[statut]}
      </span>
    </div>
  );
}

export default async function LeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [lead, profiles] = await Promise.all([
    db.query.leads.findFirst({
      where: eq(leadsTable.id, id),
      with: {
        stage: true,
        responsable: true,
        modifiePar: true,
        poseur: true,
        notes: {
          with: { auteur: true },
          orderBy: (n, { desc }) => [desc(n.createdAt)],
        },
        echanges: {
          with: { auteur: true },
          orderBy: (e, { desc }) => [desc(e.date)],
        },
        devis: {
          orderBy: (d, { desc }) => [desc(d.createdAt)],
        },
      },
    }),
    db.query.profiles.findMany({ orderBy: (p, { asc }) => [asc(p.nom)] }),
  ]);

  const stages = await db.query.stages.findMany({
    orderBy: (s, { asc }) => [asc(s.position)],
  });

  if (!lead) notFound();

  const cycle = lead.stage?.cycle ?? 1;
  const hasRelance = lead.relanceCount > 0 || !!lead.nextRelanceDate;
  const admin = await isAdmin(); // masque coût fournisseur + marge aux ADV
  const isClient = lead.statut === "gagnee"; // fiche « mode client » (post-signature)

  // Email : qui est connecté + depuis quelle adresse il enverra (diagnostic + UX).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const connectedEmail = user?.email ?? null;
  const senderFrom = resolveSender(connectedEmail)?.from ?? null;
  const emailConfigured =
    !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET && !!senderFrom;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-4 px-6 py-6">
      <div className="flex items-center justify-between">
        <Link
          href="/kanban"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Retour au Kanban
        </Link>
        <Link
          href={`/leads/${lead.id}/modifier`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Modifier
        </Link>
      </div>

      {/* Alerte : lead non attribué */}
      {!lead.assignedTo ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <span className="text-sm font-semibold text-amber-800">
            ⚠ Ce lead n&apos;est pas attribué.
          </span>
          {user?.id ? (
            <form action={assignLead.bind(null, lead.id, user.id)}>
              <Button
                type="submit"
                size="sm"
                className="bg-amber-600 text-white hover:bg-amber-700"
              >
                M&apos;attribuer
              </Button>
            </form>
          ) : null}
          <span className="text-xs text-amber-700">
            ou choisis un responsable en haut de la fiche.
          </span>
        </div>
      ) : null}

      {/* Bandeau informations principales */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-display text-2xl">{lead.nom}</CardTitle>
                <StatutBadge statut={lead.statut} />
                {lead.resoumission ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-violet-700">
                    📩 2ᵉ formulaire
                  </span>
                ) : null}
              </div>
              {lead.entreprise ? (
                <div className="text-sm text-muted-foreground">
                  {lead.entreprise}
                </div>
              ) : null}
            </div>
            {/* Attribution — bien visible */}
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-1.5">
              <span className="text-eyebrow text-muted-foreground">Géré par</span>
              <AssignSelect
                leadId={lead.id}
                profiles={profiles}
                assignedTo={lead.assignedTo}
                currentUserId={user?.id ?? null}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* PRISE D'INFO — essentiels de l'appel, bien en évidence */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <BigField
              label="Téléphone"
              value={
                lead.telephone ? (
                  <a
                    href={`tel:${lead.telephone.replace(/[^+\d]/g, "")}`}
                    className="text-primary hover:underline"
                  >
                    {lead.telephone}
                  </a>
                ) : null
              }
            />
            <BigField
              label="Email"
              value={
                lead.email ? (
                  <a href={`mailto:${lead.email}`} className="text-primary hover:underline">
                    {lead.email}
                  </a>
                ) : null
              }
            />
            <BigField
              label="Type de projet"
              value={humanise(lead.typeProjet) || humanise(lead.dimensions)}
            />
          </div>

          {/* Coordonnées client (éditables) OU besoin prospect selon le statut */}
          {isClient ? (
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="text-eyebrow text-muted-foreground">
                Coordonnées &amp; localisation
              </div>
              <ChampsEditables
                leadId={lead.id}
                champs={[
                  { key: "telephone", label: "Téléphone", value: lead.telephone, type: "tel" },
                  { key: "email", label: "Email", value: lead.email, type: "email" },
                  { key: "ville", label: "Ville", value: lead.ville },
                  { key: "adresse", label: "Adresse", value: lead.adresse, full: true },
                  { key: "codePostal", label: "Code postal", value: lead.codePostal },
                ]}
              />
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="text-eyebrow mb-2 text-muted-foreground">
                Besoin client
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Code postal" value={lead.codePostal} />
                <Field
                  label="Appel souhaité (créneau)"
                  value={humanise(lead.dateSouhaiteeAppel)}
                />
                <Field
                  label="Installation souhaitée"
                  value={humanise(lead.dateInstallation)}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Suivi — pipeline + activité regroupés (le cœur du travail) */}
      <Card className="border-l-4 border-l-primary">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground">
            Suivi
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-eyebrow mb-2 text-muted-foreground">
              Pipeline — déplacer la fiche
            </div>
            <StageMover
              leadId={lead.id}
              stages={stages}
              currentStageId={lead.stageId}
            />
          </div>
          <Separator />
          <div>
            <div className="text-eyebrow mb-2 text-muted-foreground">Activité</div>
            <ActivitePills leadId={lead.id} cycle={cycle} activites={lead.echanges} />
          </div>
          <Separator />
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

      {/* Emails (Gmail) — fil envois + réponses */}
      {emailConfigured && lead.email ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-eyebrow text-muted-foreground">Emails</CardTitle>
          </CardHeader>
          <CardContent>
            <EmailThread leadEmail={lead.email} />
          </CardContent>
        </Card>
      ) : null}

      {/* Conversation d'équipe — mis en avant */}
      <Card className="border-l-4 border-l-brand">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground">
            Conversation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Conversation
            leadId={lead.id}
            profiles={profiles}
            messages={lead.notes}
            currentUserId={user?.id ?? null}
          />
        </CardContent>
      </Card>

      {/* RDV + Relance — cycles prospection & devis (masqué en mode client) */}
      {cycle <= 2 && !isClient ? (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-eyebrow text-muted-foreground">Rendez-vous</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Date" value={formatDate(lead.rdvDate)} />
            <Field label="Heure" value={lead.rdvHeure} />
            <Field
              label="Type"
              value={lead.rdvType ? RDV_TYPE_LABEL[lead.rdvType] : "—"}
            />
            <Field
              label="Statut"
              value={lead.rdvStatut ? RDV_STATUT_LABEL[lead.rdvStatut] : "—"}
            />
            {lead.rdvDate ? (
              <Field
                label="Google Agenda"
                value={
                  lead.rdvEventId ? (
                    <span className="text-green-700">✓ synchronisé</span>
                  ) : (
                    <span className="text-muted-foreground">non synchronisé</span>
                  )
                }
              />
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-eyebrow text-muted-foreground">Relance</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <Field
              label="Prochaine relance"
              value={
                hasRelance ? (
                  <span className="text-orange-700">
                    {formatDate(lead.nextRelanceDate)}
                  </span>
                ) : (
                  "—"
                )
              }
            />
            <Field label="Nombre de relances" value={String(lead.relanceCount)} />
          </CardContent>
        </Card>
      </div>
      ) : null}

      {/* Suivi commercial — dès le cycle devis */}
      {cycle >= 2 ? (
      <Card>
        <CardHeader>
          <CardTitle className="text-eyebrow text-muted-foreground">
            Suivi commercial
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field
            label="1er contact"
            value={
              lead.datePremierContact
                ? new Date(lead.datePremierContact).toLocaleString("fr-FR", {
                    dateStyle: "short",
                    timeStyle: "short",
                    timeZone: "Europe/Paris",
                  })
                : "—"
            }
          />
          <Field
            label="Mode de paiement"
            value={lead.modePaiement ? MODE_PAIEMENT_LABEL[lead.modePaiement] : "—"}
          />
          <Field label="Acompte" value={formatEuros(lead.acompte)} />
          <Field
            label="Raison de perte"
            value={lead.raisonPerte ? RAISON_PERTE_LABEL[lead.raisonPerte] : "—"}
          />
        </CardContent>
      </Card>
      ) : null}

      {/* Produit — dès le cycle devis */}
      {cycle >= 2 ? (
      <Card>
        <CardHeader>
          <CardTitle className="text-eyebrow text-muted-foreground">Produit</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Gamme" value={lead.gamme} />
          <Field label="Dimensions" value={lead.dimensions} />
          <Field label="Finition" value={lead.finition} />
          <Field
            label="Type de pose"
            value={lead.typePose ? TYPE_POSE_LABEL[lead.typePose] : "—"}
          />
          <Field label="Options" value={humanise(lead.options)} />
          {/* Coût fournisseur + marge = secrets business → admin uniquement. */}
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
        </CardContent>
      </Card>
      ) : null}

      {/* Pose & technique — cycle 3 uniquement */}
      {cycle === 3 ? (
      <Card>
        <CardHeader>
          <CardTitle className="text-eyebrow text-muted-foreground">
            Pose & technique
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field
            label="Poseur / métreur"
            value={lead.poseur?.nom ?? lead.poseur?.email ?? "Non assigné"}
          />
          <Field label="Date du métré" value={formatDate(lead.dateMetre)} />
          <Field label="Fournisseur" value={lead.fournisseur} />
          <Field label="Réf. commande" value={lead.refCommande} />
          <Field label="Date commande" value={formatDate(lead.dateCommande)} />
          <Field label="Livraison prévue" value={formatDate(lead.dateLivraisonPrevue)} />
          <Field label="Livraison réelle" value={formatDate(lead.dateLivraisonReelle)} />
          <Field label="Pose prévue" value={formatDate(lead.datePosePrevue)} />
          <Field label="Pose réalisée" value={formatDate(lead.datePoseReelle)} />
          <Field label="Adresse de pose" value={lead.adressePose} />
        </CardContent>
      </Card>
      ) : null}

      {/* Encaissement & administratif — dossier client (fiches gagnées) */}
      {lead.statut === "gagnee" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-eyebrow text-muted-foreground">
              Encaissement &amp; administratif
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EncaissementForm
              leadId={lead.id}
              montantHt={lead.montant ? Number(lead.montant) : null}
              montantTtc={lead.montantTtc}
              acompteEncaisse={lead.acompteEncaisse}
              paiementEspece={lead.paiementEspece}
              financeur={lead.financeur}
              equipePose={lead.equipePose}
              mesure={lead.mesure}
              factureSoldeClient={lead.factureSoldeClient}
              factureSoldePoseur={lead.factureSoldePoseur}
              dossierDateEnvoi={lead.dossierDateEnvoi}
            />
          </CardContent>
        </Card>
      ) : null}

      {/* Garanties — portefeuille client (fiches gagnées) */}
      {lead.statut === "gagnee"
        ? (() => {
            const g = computeGaranties({
              datePoseReelle: lead.datePoseReelle,
              dateSignature: lead.dateSignature,
            });
            return (
              <Card>
                <CardHeader>
                  <CardTitle className="text-eyebrow text-muted-foreground">
                    Garanties
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-xs text-muted-foreground">
                    Point de départ :{" "}
                    {g.source === "pose"
                      ? `pose du ${formatDate(g.depart)}`
                      : g.source === "signature"
                        ? `signature du ${formatDate(g.depart)} (pose non datée)`
                        : "à définir (aucune date de pose ni de signature)"}
                  </div>
                  <GarantieLigne
                    titre="Structure aluminium"
                    ans={GARANTIE_STRUCTURE_ANS}
                    fin={g.structureFin}
                    statut={g.structureStatut}
                  />
                  <GarantieLigne
                    titre="Motorisation"
                    ans={GARANTIE_MOTORISATION_ANS}
                    fin={g.motorisationFin}
                    statut={g.motorisationStatut}
                  />
                </CardContent>
              </Card>
            );
          })()
        : null}

      {/* Devis — composés dans le CRM puis créés dans Pennylane */}
      <Card>
        <CardHeader>
          <CardTitle className="text-eyebrow text-muted-foreground">Devis</CardTitle>
        </CardHeader>
        <CardContent>
          <DevisEditor
            leadId={lead.id}
            devisExistants={lead.devis}
            pennylaneConfigured={!!process.env.PENNYLANE_API_KEY}
          />
        </CardContent>
      </Card>

      {/* Autres informations — secondaire, en bas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-eyebrow text-muted-foreground">
            Autres informations
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Source" value={lead.source} />
          <Field label="Campagne" value={lead.campagne} />
          <Field label="Montant" value={formatEuros(lead.montant)} />
          <Field
            label="Probabilité"
            value={lead.probabilite !== null ? `${lead.probabilite} %` : "—"}
          />
          <Field label="Objectif" value={formatDate(lead.objectifDate)} />
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
        </CardContent>
      </Card>

      <div className="flex justify-center pt-2">
        <Link
          href={`/leads/${lead.id}/modifier`}
          className={buttonVariants({ variant: "outline" })}
        >
          Modifier la fiche
        </Link>
      </div>
    </main>
  );
}
