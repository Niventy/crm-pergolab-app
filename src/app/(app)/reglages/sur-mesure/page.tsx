import { FileText } from "lucide-react";
import {
  composantsPour,
  TOKENS_DESCRIPTION,
} from "../../leads/[id]/devis/[devisId]/sur-mesure";
import { getDescriptionsSurMesure, getOptionsConfigurateur } from "../actions";
import { ReglagesNav } from "../reglages-nav";
import { DescriptionsSurMesure } from "./mapping-client";

export const dynamic = "force-dynamic";

// Page ouverte à TOUTE l'équipe (pas seulement les admins) : ce sont les textes
// commerciaux du devis, que l'ADV doit pouvoir ajuster elle-même.
export default async function ReglagesSurMesurePage() {
  const [descriptions, options] = await Promise.all([
    getDescriptionsSurMesure(),
    getOptionsConfigurateur(),
  ]);
  const composants = composantsPour(options);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-5 px-6 py-6 pb-28">
      <ReglagesNav />
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-brand text-brand-foreground">
          <FileText className="size-5" />
        </span>
        <div>
          <h1 className="text-display text-2xl">Descriptions du devis</h1>
          <p className="text-sm text-muted-foreground">
            Le texte type de chaque gamme et de chaque option. Il est injecté sur la
            ligne correspondante à chaque nouveau devis (et reste modifiable ligne par
            ligne dans l&apos;éditeur, via « Texte du devis »). Les devis déjà créés ne
            changent pas.
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

      <DescriptionsSurMesure composants={composants} descriptions={descriptions} />
    </main>
  );
}
