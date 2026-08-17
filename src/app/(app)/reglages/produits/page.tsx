import { notFound } from "next/navigation";
import { PackageOpen } from "lucide-react";
import { isAdmin } from "@/lib/current-user";
import { getProduitsCatalogue } from "../actions";
import { ReglagesNav } from "../reglages-nav";
import { ProduitsCatalogueClient } from "./produits-client";

export const dynamic = "force-dynamic";

export default async function ReglagesProduitsPage() {
  if (!(await isAdmin())) notFound();

  const produits = await getProduitsCatalogue(true);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-6 py-6 pb-28">
      <ReglagesNav />
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-brand text-brand-foreground">
          <PackageOpen className="size-5" />
        </span>
        <div>
          <h1 className="text-display text-2xl">Produits &amp; options</h1>
          <p className="text-sm text-muted-foreground">
            Catalogue interne de produits (menuiseries, forfaits, énergie,
            clauses…). Chacun peut être ajouté directement en ligne de devis, avec
            sa description et son prix.
          </p>
        </div>
      </div>

      <ProduitsCatalogueClient produits={produits} />
    </main>
  );
}
