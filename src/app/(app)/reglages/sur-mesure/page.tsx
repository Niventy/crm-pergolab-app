import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { isAdmin } from "@/lib/current-user";
import {
  COMPOSANTS,
  TOKENS_DESCRIPTION,
} from "../../leads/[id]/devis/[devisId]/sur-mesure";
import { getDescriptionsSurMesure } from "../actions";
import { DescriptionsSurMesure } from "./mapping-client";

export const dynamic = "force-dynamic";

export default async function ReglagesSurMesurePage() {
  if (!(await isAdmin())) notFound();

  const descriptions = await getDescriptionsSurMesure();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-6 py-6 pb-28">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-brand text-brand-foreground">
          <FileText className="size-5" />
        </span>
        <div>
          <h1 className="text-display text-2xl">Descriptions sur-mesure</h1>
          <p className="text-sm text-muted-foreground">
            Rédige la description pré-stockée de chaque composant. Elle s&apos;ajoute
            automatiquement sur la ligne correspondante quand on configure une pergola
            sur-mesure, et s&apos;affiche dans le CRM comme sur le devis.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-muted/40 p-3">
        <div className="text-eyebrow mb-2 text-muted-foreground">
          Variables dynamiques (remplacées par le configurateur)
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TOKENS_DESCRIPTION.map((t) => (
            <span
              key={t.token}
              title={t.libelle}
              className="rounded-md border border-border bg-white px-2 py-0.5 text-xs"
            >
              <code className="font-semibold text-primary">{t.token}</code>
              <span className="ml-1.5 text-muted-foreground">{t.libelle}</span>
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Exemple : «&nbsp;Largeur <code>{"{largeur}"}</code> mm&nbsp;» devient
          «&nbsp;Largeur 6000 mm&nbsp;» pour une pergola de 6&nbsp;m de large.
        </p>
      </div>

      <DescriptionsSurMesure composants={COMPOSANTS} descriptions={descriptions} />
    </main>
  );
}
