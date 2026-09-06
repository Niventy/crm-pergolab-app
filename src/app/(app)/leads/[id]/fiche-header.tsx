import {
  Phone,
  Mail,
  MapPin,
  Megaphone,
  Clock,
  PhoneCall,
  CalendarDays,
  RefreshCw,
  Wallet,
  CalendarClock,
  Ruler,
  Truck,
  Wrench,
  BadgeCheck,
  Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate, formatEurosCents, formatTelephone, humanise, telHref, tempsRelatif } from "@/lib/format";
import { departementDe } from "@/lib/departements";
import { PHASE_META, type Phase } from "@/app/(app)/clients/phases-meta";
import { AssignSelect } from "./assign-select";
import { Reactiver } from "./reactiver";

type Profil = { id: string; nom: string | null; email: string };

export type HeaderProspection = {
  tentatives: number; // appels journalisés
  dernierContact: Date | string | null;
  premierContact: Date | string | null;
  rdv: { date: string | null; heure: string | null; type: string | null; statut: string | null };
  nextRelanceDate: string | null;
  relanceCount: number;
};

export type HeaderClient = {
  phase: Phase;
  ttc: number | null;
  encaisse: number;
  nbPaiements: number;
  echeance: { label: string; date: string; passe: boolean; Icon: "metre" | "livraison" | "pose" } | null;
  poseur: string | null;
  devisNumero: string | null;
  dateSignature: string | null;
};

const RAISON: Record<string, string> = {
  prix: "prix",
  delai: "délai",
  concurrent: "concurrent",
  injoignable: "injoignable",
  annule: "projet annulé",
  non_qualifie: "non qualifié / hors zone",
  autre: "autre",
};

// EN-TÊTE COMPACT : qui, où en est-on, quoi faire maintenant. Remplace le
// bandeau + 4 cartes d'infos dispersées. Le même composant sert au prospect
// (bandeau de prospection) et au client (bandeau chantier / argent).
export function FicheHeader({
  lead,
  stage,
  isClient,
  today,
  prospection,
  client,
  profiles,
  currentUserId,
}: {
  lead: {
    id: string;
    nom: string;
    entreprise: string | null;
    siret?: string | null;
    statut: string;
    telephone: string | null;
    email: string | null;
    codePostal: string | null;
    ville: string | null;
    typeProjet: string | null;
    dimensions: string | null; // dimensions de la pergola (champ « dimensions » du formulaire Meta)
    source: string | null;
    campagne: string | null;
    createdAt: Date | string;
    assignedTo: string | null;
    resoumission: boolean;
    raisonPerte: string | null;
    updatedAt: Date | string;
  };
  stage: { nom: string; couleur: string; cycle: number } | null;
  isClient: boolean;
  today: string;
  prospection: HeaderProspection | null;
  client: HeaderClient | null;
  profiles: Profil[];
  currentUserId: string | null;
}) {
  const perdu = lead.statut === "perdue";
  const annulee = perdu && isClient;
  const recuIlYA = tempsRelatif(lead.createdAt);
  const dept = departementDe(lead.codePostal);
  const dimensions = humanise(lead.dimensions) || humanise(lead.typeProjet);

  return (
    <header className="rounded-xl border border-border bg-white">
      {/* Ligne 1 : identité + statut + attribution */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-display text-2xl leading-none">{lead.nom}</h1>
            {isClient ? (
              annulee ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                  <Ban className="size-3" /> Commande annulée
                </span>
              ) : (
                <span className="rounded-md bg-green-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                  Client
                </span>
              )
            ) : perdu ? (
              <span className="rounded-md bg-red-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                Perdu
              </span>
            ) : null}
            {stage ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white"
                style={{ backgroundColor: stage.couleur }}
              >
                {stage.nom}
              </span>
            ) : null}
            {lead.resoumission ? (
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700">
                2ᵉ formulaire
              </span>
            ) : null}
          </div>
          {lead.entreprise ? (
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                Pro
              </span>
              <span>{lead.entreprise}</span>
              {lead.siret ? <span className="text-xs">SIRET {lead.siret}</span> : null}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-1.5">
          <span className="text-eyebrow text-muted-foreground">Géré par</span>
          <AssignSelect
            leadId={lead.id}
            profiles={profiles}
            assignedTo={lead.assignedTo}
            currentUserId={currentUserId}
          />
        </div>
      </div>

      {/* Ligne 2 : contact + localisation + origine */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 pt-3 text-sm sm:px-5">
        {lead.telephone ? (
          <a
            href={telHref(lead.telephone)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-sm font-semibold tabular-nums text-primary-foreground hover:bg-primary/90"
          >
            <Phone className="size-4" /> {formatTelephone(lead.telephone)}
          </a>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-amber-700">
            <Phone className="size-4" /> Pas de téléphone
          </span>
        )}
        {lead.email ? (
          <a
            href={`mailto:${lead.email}`}
            className="inline-flex items-center gap-1.5 text-primary hover:underline"
          >
            <Mail className="size-4" /> {lead.email}
          </a>
        ) : null}
        {/* DÉPARTEMENT en gros : 1er critère « dans la zone / hors zone ». */}
        {dept ? (
          <span
            className="inline-flex items-center gap-2 rounded-md border border-border bg-muted/50 px-2.5 py-1"
            title={`Code postal ${lead.codePostal}`}
          >
            <MapPin className="size-4 text-muted-foreground" />
            <span className="text-display text-lg leading-none text-foreground">{dept.code}</span>
            <span className="text-sm font-semibold text-foreground">{dept.nom}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{lead.codePostal}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-sm font-semibold text-amber-800">
            <MapPin className="size-4" /> Code postal manquant
          </span>
        )}
        {!isClient ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-foreground" title="Dimensions demandées">
            <Ruler className="size-4 text-muted-foreground" />
            {dimensions ? (
              <span className="font-semibold">{dimensions}</span>
            ) : (
              <span className="text-muted-foreground">Dimensions non renseignées</span>
            )}
          </span>
        ) : lead.ville ? (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">{lead.ville}</span>
        ) : null}
        {lead.source ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={lead.campagne ?? undefined}>
            <Megaphone className="size-3.5" />
            {lead.source}
          </span>
        ) : null}
      </div>

      {/* Ligne 3 : bandeau de situation */}
      {perdu && !isClient ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border bg-red-50/60 px-4 py-2.5 text-sm sm:px-5">
          <span className="font-semibold text-red-800">
            Perdu{lead.raisonPerte ? ` · ${RAISON[lead.raisonPerte] ?? lead.raisonPerte}` : ""}
          </span>
          <span className="text-xs text-red-700/80">
            dernière modification {tempsRelatif(lead.updatedAt)}
          </span>
          <span className="ml-auto">
            <Reactiver leadId={lead.id} />
          </span>
        </div>
      ) : isClient && client ? (
        <BandeauClient c={client} annulee={annulee} />
      ) : prospection ? (
        <BandeauProspection p={prospection} recuIlYA={recuIlYA} today={today} />
      ) : null}
    </header>
  );
}

function BandeauProspection({
  p,
  recuIlYA,
  today,
}: {
  p: HeaderProspection;
  recuIlYA: string;
  today: string;
}) {
  const jamaisContacte = !p.premierContact && p.tentatives === 0;
  const relanceEnRetard = !!p.nextRelanceDate && p.nextRelanceDate < today;
  const relanceAujourdhui = p.nextRelanceDate === today;
  const rdvPasse = !!p.rdv.date && p.rdv.date < today && p.rdv.statut !== "honore";
  return (
    <div className="mt-3 grid grid-cols-1 gap-px border-t border-border bg-border sm:grid-cols-3">
      {/* Contact */}
      <div className={cn("bg-white px-4 py-2.5 sm:px-5", jamaisContacte && "bg-amber-50")}>
        <div className="text-eyebrow flex items-center gap-1 text-muted-foreground">
          <Clock className="size-3.5" /> Reçu {recuIlYA ? `il y a ${recuIlYA}` : ""}
        </div>
        <div className={cn("mt-0.5 flex items-center gap-1.5 text-sm font-semibold", jamaisContacte ? "text-amber-800" : "text-foreground")}>
          <PhoneCall className="size-4" />
          {jamaisContacte
            ? "Jamais appelé — à traiter"
            : `${p.tentatives} appel${p.tentatives > 1 ? "s" : ""}${
                p.dernierContact ? ` · dernier ${tempsRelatif(p.dernierContact)}` : ""
              }`}
        </div>
      </div>
      {/* RDV */}
      <div className={cn("bg-white px-4 py-2.5 sm:px-5", rdvPasse && "bg-amber-50", p.rdv.statut === "a_reprogrammer" && "bg-amber-50")}>
        <div className="text-eyebrow flex items-center gap-1 text-muted-foreground">
          <CalendarDays className="size-3.5" /> Rendez-vous
        </div>
        <div className="mt-0.5 text-sm font-semibold text-foreground">
          {p.rdv.date ? (
            <>
              {formatDate(p.rdv.date)}
              {p.rdv.heure ? ` à ${p.rdv.heure}` : ""}
              {p.rdv.type ? ` · ${p.rdv.type}` : ""}
              {p.rdv.statut === "honore" ? (
                <span className="ml-1.5 rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-teal-700">honoré</span>
              ) : p.rdv.statut === "a_reprogrammer" ? (
                <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700">à reprogrammer</span>
              ) : rdvPasse ? (
                <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700">passé — honoré ?</span>
              ) : null}
            </>
          ) : (
            <span className="font-normal text-muted-foreground">Aucun RDV fixé</span>
          )}
        </div>
      </div>
      {/* Relance */}
      <div className={cn("bg-white px-4 py-2.5 sm:px-5", relanceEnRetard && "bg-red-50", relanceAujourdhui && "bg-orange-50")}>
        <div className="text-eyebrow flex items-center gap-1 text-muted-foreground">
          <RefreshCw className="size-3.5" /> Relance
        </div>
        <div
          className={cn(
            "mt-0.5 text-sm font-semibold",
            relanceEnRetard ? "text-red-700" : relanceAujourdhui ? "text-orange-700" : "text-foreground",
          )}
        >
          {p.nextRelanceDate ? (
            <>
              {relanceEnRetard ? "En retard · " : relanceAujourdhui ? "Aujourd'hui · " : ""}
              {formatDate(p.nextRelanceDate)}
              {p.relanceCount ? (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  déjà {p.relanceCount}×
                </span>
              ) : null}
            </>
          ) : (
            <span className="font-normal text-muted-foreground">Aucune relance programmée</span>
          )}
        </div>
      </div>
    </div>
  );
}

function BandeauClient({ c, annulee }: { c: HeaderClient; annulee: boolean }) {
  const reste = c.ttc == null ? null : Math.max(0, c.ttc - c.encaisse);
  const pct = c.ttc && c.ttc > 0 ? Math.min(100, Math.round((c.encaisse / c.ttc) * 100)) : 0;
  const pm = PHASE_META[c.phase];
  const EchIcon = c.echeance?.Icon === "metre" ? Ruler : c.echeance?.Icon === "livraison" ? Truck : Wrench;
  return (
    <div className="mt-3 grid grid-cols-1 gap-px border-t border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
      <div className="bg-white px-4 py-2.5 sm:px-5">
        <div className="text-eyebrow flex items-center gap-1 text-muted-foreground">
          <BadgeCheck className="size-3.5" /> Signature
        </div>
        <div className="mt-0.5 text-sm font-semibold text-foreground">
          {c.dateSignature ? (
            <>
              {formatDate(c.dateSignature)}
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                ({tempsRelatif(`${c.dateSignature}T12:00:00`) || "aujourd'hui"})
              </span>
            </>
          ) : (
            <span className="font-normal text-muted-foreground">Date inconnue</span>
          )}
          {c.devisNumero ? (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">· devis {c.devisNumero}</span>
          ) : null}
        </div>
      </div>
      <div className="bg-white px-4 py-2.5 sm:px-5">
        <div className="text-eyebrow flex items-center justify-between text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Wallet className="size-3.5" /> Argent</span>
          {!annulee ? (
            <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]", pm.cls)}>
              <span className={cn("size-1.5 rounded-full", pm.dot)} /> {pm.label}
            </span>
          ) : null}
        </div>
        {c.ttc != null ? (
          <>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border">
              <div className="h-full rounded-full bg-green-600" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-[11px]">
              <span className="text-green-700">
                {formatEurosCents(c.encaisse)} encaissé{c.nbPaiements ? ` (${c.nbPaiements})` : ""}
              </span>
              <span className={reste && reste > 0 ? "text-orange-700" : "text-green-700"}>
                {reste && reste > 0 ? `reste ${formatEurosCents(reste)}` : "soldé"} / {formatEurosCents(c.ttc)}
              </span>
            </div>
          </>
        ) : (
          <div className="mt-0.5 text-xs text-amber-700">
            TTC inconnu — marque le devis signé.{c.encaisse > 0 ? ` Encaissé ${formatEurosCents(c.encaisse)}.` : ""}
          </div>
        )}
      </div>
      <div className={cn("bg-white px-4 py-2.5 sm:px-5", c.echeance?.passe && "bg-red-50")}>
        <div className="text-eyebrow flex items-center gap-1 text-muted-foreground">
          <CalendarClock className="size-3.5" /> Prochaine échéance
        </div>
        {c.echeance ? (
          <div className={cn("mt-0.5 flex items-center gap-1.5 text-sm font-semibold", c.echeance.passe ? "text-red-700" : "text-foreground")}>
            <EchIcon className="size-4" />
            {c.echeance.label} · {formatDate(c.echeance.date)}
            {c.echeance.passe ? " (dépassée)" : ""}
          </div>
        ) : (
          <div className="mt-0.5 text-sm text-muted-foreground">Rien de planifié</div>
        )}
      </div>
      <div className={cn("bg-white px-4 py-2.5 sm:px-5", !c.poseur && "bg-amber-50")}>
        <div className="text-eyebrow flex items-center gap-1 text-muted-foreground">
          <Wrench className="size-3.5" /> Pose
        </div>
        <div className={cn("mt-0.5 text-sm font-semibold", c.poseur ? "text-foreground" : "text-amber-800")}>
          {c.poseur ?? "Poseur non affecté"}
        </div>
      </div>
    </div>
  );
}
