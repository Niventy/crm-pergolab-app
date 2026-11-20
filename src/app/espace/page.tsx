import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resoudreJeton } from "@/lib/espace-client";
import { COOKIE_ESPACE } from "@/lib/supabase/middleware";
import { ConnexionForm } from "./connexion-form";
import { emailDisponible } from "@/lib/espace-client-config";
import { getInfosEntreprise } from "@/lib/parametres";
import { formatTelephone, telHref } from "@/lib/format";

export const metadata: Metadata = {
  title: "Espace client — Pergolab",
  robots: { index: false, follow: false },
};

// Page de connexion de l'espace client. Appareil déjà connu (cookie posé à
// l'ouverture d'un lien) et lien toujours valable → directement au projet.
export default async function EspaceConnexionPage() {
  const jeton = (await cookies()).get(COOKIE_ESPACE)?.value;
  if (jeton && (await resoudreJeton(jeton))) redirect(`/espace/${jeton}`);
  const envoiActif = emailDisponible();
  const infos = envoiActif ? null : await getInfosEntreprise();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-50">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-md items-center px-4 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-pergolab.png" alt="Pergolab" className="h-8 w-auto" />
          <span className="ml-auto text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Espace client
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-md px-4 py-10">
        <h1 className="font-[family-name:var(--font-barlow)] text-2xl font-bold">
          Accédez à votre projet
        </h1>
        {envoiActif ? (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              Saisissez l&apos;adresse email communiquée lors de votre commande : nous vous
              envoyons un lien de connexion. Pas de mot de passe à retenir.
            </p>
            <ConnexionForm />
          </>
        ) : (
          // Envoi d'emails pas encore configuré : accès par le lien transmis.
          <div className="mt-6 rounded-xl border border-border bg-white p-5 text-sm shadow-sm">
            <p>
              Pour accéder à votre projet, ouvrez le lien personnel que votre conseiller
              Pergolab vous a transmis.
            </p>
            {infos?.telephone ? (
              <p className="mt-3">
                Vous ne l&apos;avez plus ? Appelez-nous au{" "}
                <a href={telHref(infos.telephone)} className="font-semibold text-primary">
                  {formatTelephone(infos.telephone)}
                </a>
                .
              </p>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
