import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leads as leadsTable } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { resolveSender } from "@/lib/email-sender";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatEuros, formatDate, initiales, tempsRelatif, humanise } from "@/lib/format";
import { markGagnee, markPerdue, passerAuCycle } from "./actions";
import { ActivitePills } from "./activite-pills";
import { EmailCompose } from "./email-compose";
import { EmailThread } from "./email-thread";
import { Conversation } from "./conversation";

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

function AssignationBadge({
  profil,
}: {
  profil: { nom: string | null; email: string } | null;
}) {
  const nom = profil?.nom ?? profil?.email ?? null;
  if (nom) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 py-0.5 pr-2.5 pl-0.5 text-xs font-semibold text-primary">
        <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
          {initiales(nom)}
        </span>
        {nom}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
      <span className="size-1.5 rounded-full bg-amber-500" />
      Non assigné
    </span>
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
      },
    }),
    db.query.profiles.findMany({ orderBy: (p, { asc }) => [asc(p.nom)] }),
  ]);

  if (!lead) notFound();

  const cycle = lead.stage?.cycle ?? 1;
  const hasRelance = lead.relanceCount > 0 || !!lead.nextRelanceDate;

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

      {/* Bandeau informations principales */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-display text-2xl">{lead.nom}</CardTitle>
                <StatutBadge statut={lead.statut} />
                <AssignationBadge profil={lead.responsable} />
              </div>
              {lead.entreprise ? (
                <div className="text-sm text-muted-foreground">
                  {lead.entreprise}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {lead.stage?.cycle === 1 ? (
                <form action={passerAuCycle.bind(null, lead.id, 2)}>
                  <Button
                    type="submit"
                    size="lg"
                    className="bg-brand text-brand-foreground hover:bg-brand/90"
                  >
                    Devis envoyé →
                  </Button>
                </form>
              ) : null}
              {lead.statut === "gagnee" && (lead.stage?.cycle ?? 0) < 3 ? (
                <form action={passerAuCycle.bind(null, lead.id, 3)}>
                  <Button
                    type="submit"
                    size="lg"
                    className="bg-brand text-brand-foreground hover:bg-brand/90"
                  >
                    Démarrer la pose →
                  </Button>
                </form>
              ) : null}
              <form action={markGagnee.bind(null, lead.id)}>
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  className="border-green-300 text-green-700 hover:bg-green-50"
                >
                  Gagnée
                </Button>
              </form>
              <form action={markPerdue.bind(null, lead.id)}>
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-50"
                >
                  Perdue
                </Button>
              </form>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Indicateurs clés */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Montant" value={formatEuros(lead.montant)} />
            <Field
              label="Probabilité"
              value={lead.probabilite !== null ? `${lead.probabilite} %` : "—"}
            />
            <Field label="Objectif" value={formatDate(lead.objectifDate)} />
            <Field
              label="Étape actuelle"
              value={
                lead.stage ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: lead.stage.couleur }}
                    />
                    {lead.stage.nom}
                  </span>
                ) : (
                  "—"
                )
              }
            />
          </div>

          <Separator />

          {/* Informations client */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Type de projet" value={humanise(lead.typeProjet)} />
            <Field label="Code postal" value={lead.codePostal} />
            <Field
              label="Appel souhaité (créneau)"
              value={humanise(lead.dateSouhaiteeAppel)}
            />
            <Field label="Installation souhaitée" value={humanise(lead.dateInstallation)} />
            <Field label="Email" value={lead.email} />
            <Field label="Téléphone" value={lead.telephone} />
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
          </div>
        </CardContent>
      </Card>

      {/* Activité — actions rapides (mis en avant) */}
      <Card className="border-l-4 border-l-primary">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground">
            Activité
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ActivitePills leadId={lead.id} cycle={cycle} activites={lead.echanges} />
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
          <Conversation leadId={lead.id} profiles={profiles} messages={lead.notes} />
        </CardContent>
      </Card>

      {/* RDV + Relance — cycles prospection & devis */}
      {cycle <= 2 ? (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-eyebrow text-muted-foreground">Rendez-vous</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4">
            <Field label="Date" value={formatDate(lead.rdvDate)} />
            <Field
              label="Type"
              value={lead.rdvType ? RDV_TYPE_LABEL[lead.rdvType] : "—"}
            />
            <Field
              label="Statut"
              value={lead.rdvStatut ? RDV_STATUT_LABEL[lead.rdvStatut] : "—"}
            />
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
