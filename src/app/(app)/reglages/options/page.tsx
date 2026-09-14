import { SlidersHorizontal } from "lucide-react";
import { getOptionsConfigurateur } from "../actions";
import { ReglagesNav } from "../reglages-nav";
import { OptionsConfigurateurClient } from "./options-client";

export const dynamic = "force-dynamic";

// Ouverte à toute l'équipe : les options proposées dans le configurateur de
// devis (stores, persiennes, murs, chauffage…) avec leur mode de prix.
export default async function ReglagesOptionsPage() {
  const options = await getOptionsConfigurateur(true);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-5 px-6 py-6 pb-28">
      <ReglagesNav />
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-brand text-brand-foreground">
          <SlidersHorizontal className="size-5" />
        </span>
        <div>
          <h1 className="text-display text-2xl">Options du configurateur</h1>
          <p className="text-sm text-muted-foreground">
            Les options proposées quand on configure une pergola (une vignette chacune).
            Le prix HT vendeur se calcule selon le mode : au m², au m² + forfait par pièce,
            ou à l&apos;unité. Le texte affiché sous la ligne du devis se rédige dans
            « Descriptions du devis ». Les devis déjà créés ne changent pas.
          </p>
        </div>
      </div>

      <OptionsConfigurateurClient options={options} />
    </main>
  );
}
