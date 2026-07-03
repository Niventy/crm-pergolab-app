"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Download, ExternalLink, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatEuros } from "@/lib/format";
import { creerDevis, devisAppUrl, devisPdfUrl } from "./actions";

type DevisRow = {
  id: string;
  numero: string | null;
  montant: string | null;
  statut: string | null;
  lienExterne: string | null;
  externalId: string | null;
};

// Ouvre une URL Pennylane dans un onglet créé DANS le geste (anti-popup-blocker),
// puis redirige vers l'URL résolue côté serveur.
function ouvrirDans(
  getUrl: () => Promise<{ ok?: boolean; url?: string; error?: string } | string>,
) {
  const w = window.open("", "_blank");
  Promise.resolve(getUrl()).then((r) => {
    const url = typeof r === "string" ? r : r.url;
    if (url && w) w.location.href = url;
    else {
      if (w) w.close();
      toast.error((typeof r === "object" && r.error) || "Lien indisponible");
    }
  });
}

export function DevisEditor({
  leadId,
  devisExistants,
  pennylaneConfigured,
}: {
  leadId: string;
  devisExistants: DevisRow[];
  pennylaneConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function creer() {
    const w = window.open("", "_blank"); // onglet ouvert dans le geste
    start(async () => {
      const r = await creerDevis(leadId);
      if (r.ok && r.appUrl) {
        toast.success(`Devis ${r.numero ?? ""} créé — ouverture dans Pennylane`);
        if (w) w.location.href = r.appUrl;
        router.refresh();
      } else {
        if (w) w.close();
        toast.error(r.error ?? "Échec de la création");
      }
    });
  }

  return (
    <div className="space-y-4">
      {devisExistants.length > 0 ? (
        <ul className="divide-y divide-border">
          {devisExistants.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2 text-sm">
              <FileText className="size-4 text-muted-foreground" />
              <span className="font-medium text-foreground">{d.numero ?? "Devis"}</span>
              <span className="tabular-nums text-muted-foreground">
                {formatEuros(d.montant)}
              </span>
              {d.statut ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {d.statut}
                </span>
              ) : null}
              <span className="ml-auto flex items-center gap-3">
                {d.externalId ? (
                  <>
                    <button
                      type="button"
                      onClick={() => ouvrirDans(() => devisAppUrl(d.externalId!))}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <ExternalLink className="size-3.5" /> Éditer dans Pennylane
                    </button>
                    <button
                      type="button"
                      onClick={() => ouvrirDans(() => devisPdfUrl(d.externalId!))}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <Download className="size-3.5" /> PDF
                    </button>
                  </>
                ) : d.lienExterne ? (
                  <a
                    href={d.lienExterne}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Ouvrir ↗
                  </a>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Aucun devis pour l&apos;instant.</p>
      )}

      {!pennylaneConfigured ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Pennylane n&apos;est pas encore configuré (<code>PENNYLANE_API_KEY</code>).
          Le bouton créera le devis dès que la clé sera ajoutée sur Vercel.
        </p>
      ) : null}

      <button
        type="button"
        onClick={creer}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        <Plus className="size-4" />
        {pending ? "Création…" : "Créer un devis dans Pennylane"}
      </button>
      <p className="text-xs text-muted-foreground">
        Le CRM crée le devis (client + 1 ligne de départ) puis ouvre l&apos;éditeur
        Pennylane, où tu choisis tes produits (Essentia…), vois le devis complet et
        génères le PDF.
      </p>
    </div>
  );
}
