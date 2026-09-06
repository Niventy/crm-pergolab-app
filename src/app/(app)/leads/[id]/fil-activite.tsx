import {
  Phone,
  RefreshCw,
  Mail,
  CalendarCheck,
  CalendarDays,
  FileText,
  Ruler,
  ShoppingCart,
  Truck,
  Wrench,
  ArrowRight,
  UserCheck,
  Pencil,
  MessageSquare,
  Wallet,
  Inbox,
  Trash2,
  RotateCcw,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { initiales } from "@/lib/format";

export type FilItem = {
  id: string;
  kind: "note" | "echange";
  type: string; // note | appel | relance | email | rdv | etape | …
  date: Date | string;
  auteur: string | null;
  contenu: string;
};

// Un SEUL fil chronologique pour la fiche : notes d'équipe, appels, relances,
// emails, RDV, changements d'étape, devis, paiements… Avant : « Activité »
// (échanges) et « Conversation » (notes) étaient deux listes séparées.
const META: Record<string, { label: string; Icon: typeof Phone; cls: string }> = {
  note: { label: "Note", Icon: MessageSquare, cls: "bg-lime-100 text-lime-800" },
  appel: { label: "Appel", Icon: Phone, cls: "bg-blue-100 text-blue-700" },
  relance: { label: "Relance", Icon: RefreshCw, cls: "bg-orange-100 text-orange-700" },
  email: { label: "Email", Icon: Mail, cls: "bg-violet-100 text-violet-700" },
  rdv: { label: "RDV", Icon: CalendarDays, cls: "bg-blue-100 text-blue-700" },
  rdv_honore: { label: "RDV honoré", Icon: CalendarCheck, cls: "bg-teal-100 text-teal-700" },
  devis_cree: { label: "Devis créé", Icon: FileText, cls: "bg-slate-100 text-slate-700" },
  devis_envoye: { label: "Devis envoyé", Icon: FileText, cls: "bg-emerald-100 text-emerald-700" },
  devis_accepte: { label: "Devis signé", Icon: FileText, cls: "bg-green-600 text-white" },
  metre: { label: "Métré", Icon: Ruler, cls: "bg-violet-100 text-violet-700" },
  commande: { label: "Commande", Icon: ShoppingCart, cls: "bg-indigo-100 text-indigo-700" },
  livre: { label: "Livré", Icon: Truck, cls: "bg-sky-100 text-sky-700" },
  pose: { label: "Posé", Icon: Wrench, cls: "bg-emerald-100 text-emerald-700" },
  etape: { label: "Étape", Icon: ArrowRight, cls: "bg-slate-100 text-slate-700" },
  attribution: { label: "Attribution", Icon: UserCheck, cls: "bg-amber-100 text-amber-700" },
  modification: { label: "Modifié", Icon: Pencil, cls: "bg-slate-100 text-slate-600" },
  paiement: { label: "Paiement", Icon: Wallet, cls: "bg-green-100 text-green-700" },
  creation: { label: "Créé", Icon: Inbox, cls: "bg-slate-100 text-slate-700" },
  suppression: { label: "Corbeille", Icon: Trash2, cls: "bg-red-100 text-red-700" },
  restauration: { label: "Restauré", Icon: RotateCcw, cls: "bg-green-100 text-green-700" },
};

const MENTION_ALL = /(@[\p{L}\p{N}._-]+)/gu;

function renderContenu(text: string, handles: Set<string>) {
  return text.split(MENTION_ALL).map((part, i) =>
    part.startsWith("@") && handles.has(part.slice(1).toLowerCase()) ? (
      <span key={i} className="rounded bg-primary/10 px-1 font-medium text-primary">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function jourLabel(d: Date, today: string): string {
  const key = d.toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
  if (key === today) return "Aujourd'hui";
  const hier = new Date(Date.now() - 86400000).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
  if (key === hier) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });
}

export function FilActivite({
  items,
  handles,
  today,
  recuLe,
  source,
}: {
  items: FilItem[];
  /** Handles @ valides (minuscule) pour la mise en évidence des mentions. */
  handles: Set<string>;
  today: string; // YYYY-MM-DD Paris
  recuLe: Date | string;
  source: string | null;
}) {
  const sorted = [...items].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  // Regroupement par jour.
  const groupes: { label: string; items: FilItem[] }[] = [];
  for (const it of sorted) {
    const label = jourLabel(new Date(it.date), today);
    const g = groupes[groupes.length - 1];
    if (g && g.label === label) g.items.push(it);
    else groupes.push({ label, items: [it] });
  }

  return (
    <div className="space-y-4">
      {groupes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucune activité pour l&apos;instant — une note ou une action apparaîtra ici.
        </p>
      ) : null}
      {groupes.map((g) => (
        <div key={g.label}>
          <div className="text-eyebrow mb-1.5 text-muted-foreground">{g.label}</div>
          <ol className="relative ml-2 space-y-2 border-l border-border pl-4">
            {g.items.map((it) => {
              const meta = META[it.type] ?? { label: it.type, Icon: Plus, cls: "bg-slate-100 text-slate-700" };
              const Icon = meta.Icon;
              const heure = new Date(it.date).toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Europe/Paris",
              });
              const estNote = it.kind === "note";
              return (
                <li key={it.id} className="relative">
                  <span
                    className={cn(
                      "absolute -left-[1.45rem] top-1 flex size-5 items-center justify-center rounded-full ring-2 ring-white",
                      meta.cls,
                    )}
                  >
                    <Icon className="size-3" aria-hidden />
                  </span>
                  <div
                    className={cn(
                      "rounded-lg px-3 py-2",
                      estNote ? "border border-lime-200 bg-lime-50/60" : "bg-muted/40",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                      <span className="tabular-nums">{heure}</span>
                      <span className="font-semibold text-foreground">{meta.label}</span>
                      {it.auteur ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="flex size-4 items-center justify-center rounded-full bg-primary/10 text-[8px] font-bold text-primary">
                            {initiales(it.auteur)}
                          </span>
                          {it.auteur}
                        </span>
                      ) : null}
                    </div>
                    <div className={cn("mt-0.5 whitespace-pre-wrap text-sm", estNote ? "text-foreground" : "text-foreground/90")}>
                      {renderContenu(it.contenu, handles)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
      {/* Origine : toujours en bas du fil */}
      <div className="ml-2 border-l border-dashed border-border pl-4 text-xs text-muted-foreground">
        Reçu le{" "}
        {new Date(recuLe).toLocaleString("fr-FR", {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: "Europe/Paris",
        })}
        {source ? ` · ${source}` : ""}
      </div>
    </div>
  );
}
