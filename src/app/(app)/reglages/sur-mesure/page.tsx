import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { isAdmin } from "@/lib/current-user";
import { COMPOSANTS } from "../../leads/[id]/devis/[devisId]/sur-mesure";
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

      <DescriptionsSurMesure composants={COMPOSANTS} descriptions={descriptions} />
    </main>
  );
}
