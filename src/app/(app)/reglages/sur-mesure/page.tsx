import { notFound } from "next/navigation";
import { Link2 } from "lucide-react";
import { isAdmin } from "@/lib/current-user";
import { OPTIONS } from "../../leads/[id]/devis/[devisId]/sur-mesure";
import { getMappingSurMesure } from "../actions";
import { MappingSurMesure } from "./mapping-client";

export const dynamic = "force-dynamic";

export default async function ReglagesSurMesurePage() {
  if (!(await isAdmin())) notFound();

  const mapping = await getMappingSurMesure();
  const options = OPTIONS.map((o) => ({ id: o.id, label: o.label }));

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-6 py-6 pb-28">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-brand text-brand-foreground">
          <Link2 className="size-5" />
        </span>
        <div>
          <h1 className="text-display text-2xl">Mapping sur-mesure ↔ Pennylane</h1>
          <p className="text-sm text-muted-foreground">
            Associe chaque option du configurateur à son produit Pennylane — sa
            description remontera alors sur les devis (le prix reste calculé au m²).
          </p>
        </div>
      </div>

      <MappingSurMesure options={options} mapping={mapping} />
    </main>
  );
}
