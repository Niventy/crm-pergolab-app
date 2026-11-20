import { ShieldCheck } from "lucide-react";
import { getInfosEntreprise } from "@/lib/parametres";
import { ReglagesNav } from "../reglages-nav";
import { InfosEspaceForm } from "./infos-form";

export const dynamic = "force-dynamic";

// Ouverte à toute l'équipe : ce que le client voit pour être mis en confiance
// dans son espace (contacts, identité légale, assurance, garanties, conditions).
export default async function ReglagesEspaceClientPage() {
  const infos = await getInfosEntreprise();
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-5 px-6 py-6 pb-28">
      <ReglagesNav />
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-brand text-brand-foreground">
          <ShieldCheck className="size-5" />
        </span>
        <div>
          <h1 className="text-display text-2xl">Espace client</h1>
          <p className="text-sm text-muted-foreground">
            Contacts de confiance et informations de l&apos;entreprise affichés à TOUS les
            clients dans leur espace. Un champ vide n&apos;est pas affiché.
          </p>
        </div>
      </div>
      <InfosEspaceForm initial={infos} />
    </main>
  );
}
