import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import {
  CalendarCheck,
  RefreshCw,
  PhoneCall,
  CalendarClock,
  FilePen,
  Clock,
  Moon,
} from "lucide-react";
import { db } from "@/db";
import { taches, leads as leadsTable } from "@/db/schema";
import { cn } from "@/lib/utils";
import { formatDateCourte, tempsRelatif } from "@/lib/format";
import { currentUserId } from "@/lib/current-user";
import { TodoList } from "./todo-list";
import { AgendaGoogle } from "./agenda-google";

export const dynamic = "force-dynamic";

const PARIS = "Europe/Paris";
function todayParis() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PARIS }).format(new Date());
}

type BLead = { id: string; nom: string; sousTitre: string };

export default async function EmploiDuTempsPage() {
  const userId = await currentUserId();

  if (!userId) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16 text-center text-sm text-muted-foreground">
        Connecte-toi pour accéder à ton espace de travail.
      </main>
    );
  }

  const [mesLeads, mesTaches] = await Promise.all([
    db.query.leads.findMany({
      where: eq(leadsTable.assignedTo, userId),
      with: { stage: true },
    }),
    db.query.taches.findMany({
      where: eq(taches.userId, userId),
      orderBy: [asc(taches.createdAt)],
      with: { lead: { columns: { id: true, nom: true } } },
    }),
  ]);

  const today = todayParis();
  const now = new Date().getTime();
  const H = 3600 * 1000;

  const b: Record<string, BLead[]> = {
    rdv: [],
    relance: [],
    rappel: [],
    devisEnvoyer: [],
    devisSansReponse: [],
    sommeil: [],
  };

  // Un lead n'est rangé que dans UNE file (la plus urgente).
  for (const l of mesLeads) {
    if (l.statut !== "en_cours") continue;
    const stage = l.stage?.nom ?? "";
    const ageH = (now - new Date(l.updatedAt).getTime()) / H;
    const rdvDuJour = l.rdvDate === today && l.rdvStatut !== "honore";

    if (l.rdvStatut === "a_reprogrammer" || rdvDuJour) {
      b.rdv.push({
        id: l.id,
        nom: l.nom,
        sousTitre:
          l.rdvStatut === "a_reprogrammer"
            ? "RDV à reprogrammer"
            : `RDV aujourd'hui${l.rdvType ? ` · ${l.rdvType}` : ""}`,
      });
    } else if (l.nextRelanceDate && l.nextRelanceDate <= today) {
      b.relance.push({
        id: l.id,
        nom: l.nom,
        sousTitre: `Relance prévue le ${formatDateCourte(l.nextRelanceDate)}${
          l.relanceCount ? ` · déjà ${l.relanceCount}×` : ""
        }`,
      });
    } else if (stage === "Rappeler" || stage === "Pas de réponse") {
      b.rappel.push({
        id: l.id,
        nom: l.nom,
        sousTitre: `${stage} · vu ${tempsRelatif(l.updatedAt)}`,
      });
    } else if (stage === "Devis à envoyer") {
      b.devisEnvoyer.push({
        id: l.id,
        nom: l.nom,
        sousTitre: `Devis à rédiger${l.codePostal ? ` · ${l.codePostal}` : ""}`,
      });
    } else if (stage === "Devis envoyé" && ageH > 72) {
      b.devisSansReponse.push({
        id: l.id,
        nom: l.nom,
        sousTitre: `Sans réponse depuis ${Math.floor(ageH / 24)} j`,
      });
    } else if (
      ageH > 48 &&
      !(l.rdvDate && l.rdvDate >= today) &&
      !(l.nextRelanceDate && l.nextRelanceDate > today)
    ) {
      b.sommeil.push({
        id: l.id,
        nom: l.nom,
        sousTitre: `Sans activité depuis ${Math.max(2, Math.floor(ageH / 24))} j${
          stage ? ` · ${stage}` : ""
        }`,
      });
    }
  }

  const SECTIONS = [
    { key: "rdv", titre: "RDV du jour", Icon: CalendarClock, accent: "text-blue-700", list: b.rdv },
    { key: "relance", titre: "Relances du jour", Icon: RefreshCw, accent: "text-orange-600", list: b.relance },
    { key: "rappel", titre: "Rappels", Icon: PhoneCall, accent: "text-primary", list: b.rappel },
    { key: "devisEnvoyer", titre: "Devis à envoyer", Icon: FilePen, accent: "text-foreground", list: b.devisEnvoyer },
    { key: "devisSansReponse", titre: "Devis sans réponse (+3 j)", Icon: Clock, accent: "text-foreground", list: b.devisSansReponse },
    { key: "sommeil", titre: "Leads en sommeil (+48 h)", Icon: Moon, accent: "text-muted-foreground", list: b.sommeil },
  ];

  const totalActions = SECTIONS.reduce((a, s) => a + s.list.length, 0);

  const leadOptions = mesLeads
    .filter((l) => l.statut === "en_cours")
    .map((l) => ({ id: l.id, nom: l.nom }))
    .sort((a, b2) => a.nom.localeCompare(b2.nom));

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-6 py-6 pb-28">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-brand text-brand-foreground">
          <CalendarCheck className="size-5" />
        </span>
        <div>
          <h1 className="text-display text-2xl">Gestion d&apos;emploi du temps</h1>
          <p className="text-sm text-muted-foreground">
            {totalActions > 0
              ? `${totalActions} action${totalActions > 1 ? "s" : ""} à traiter sur tes leads`
              : "Aucune action en attente sur tes leads"}
          </p>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-white p-4">
        <AgendaGoogle />
      </section>

      {mesLeads.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          Aucun lead ne t&apos;est attribué pour l&apos;instant. Les files de
          travail apparaîtront ici dès qu&apos;on t&apos;assignera des prospects.
        </p>
      ) : (
        SECTIONS.map((s) =>
          s.list.length === 0 ? null : (
            <section key={s.key} className="rounded-xl border border-border bg-white p-4">
              <h2 className={cn("text-eyebrow mb-2 flex items-center gap-1.5", s.accent)}>
                <s.Icon className="size-3.5" /> {s.titre} · {s.list.length}
              </h2>
              <ul className="divide-y divide-border">
                {s.list.map((bl) => (
                  <li key={bl.id}>
                    <Link
                      href={`/leads/${bl.id}`}
                      className="-mx-2 flex items-center justify-between gap-3 rounded px-2 py-2 transition-colors hover:bg-primary/[0.06]"
                    >
                      <span className="font-medium text-foreground">{bl.nom}</span>
                      <span className="text-right text-xs text-muted-foreground">
                        {bl.sousTitre}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ),
        )
      )}

      <section className="rounded-xl border border-border bg-white p-4">
        <h2 className="text-eyebrow mb-3 text-muted-foreground">Mes tâches</h2>
        <TodoList taches={mesTaches} leadOptions={leadOptions} />
      </section>
    </main>
  );
}
