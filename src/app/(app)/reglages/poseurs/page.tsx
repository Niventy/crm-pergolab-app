import { Wrench } from "lucide-react";
import { getChantiersParPoseur, getPoseurs } from "@/app/(app)/leads/[id]/poseur-actions";
import { ReglagesNav } from "../reglages-nav";
import { PoseursClient } from "./poseurs-client";

export const dynamic = "force-dynamic";

// Ouverte à toute l'équipe : la liste des poseurs proposée sur les fiches
// client (en-tête, bloc Chantier) et dans le tableau des clients.
export default async function ReglagesPoseursPage() {
  const [poseurs, compte] = await Promise.all([getPoseurs(true), getChantiersParPoseur()]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-5 px-6 py-6 pb-28">
      <ReglagesNav />
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-brand text-brand-foreground">
          <Wrench className="size-5" />
        </span>
        <div>
          <h1 className="text-display text-2xl">Poseurs</h1>
          <p className="text-sm text-muted-foreground">
            Les poseurs (ou équipes de pose) que l&apos;on choisit à un clic sur une fiche
            client. Renommer un poseur change son nom sur tous ses chantiers.
          </p>
        </div>
      </div>

      <PoseursClient poseurs={poseurs} compte={compte} />
    </main>
  );
}
