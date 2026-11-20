"use client";

import { useState } from "react";
import { Loader2, MailCheck } from "lucide-react";

// Formulaire de connexion : email → envoi du lien d'accès (réponse identique
// que l'adresse soit connue ou non).
export function ConnexionForm() {
  const [email, setEmail] = useState("");
  const [etat, setEtat] = useState<"saisie" | "envoi" | "envoye" | "erreur">("saisie");

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    setEtat("envoi");
    try {
      const res = await fetch("/espace/connexion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setEtat(res.ok ? "envoye" : "erreur");
    } catch {
      setEtat("erreur");
    }
  }

  if (etat === "envoye")
    return (
      <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
        <MailCheck className="mb-2 size-6" />
        <p className="font-semibold">Vérifiez votre boîte mail</p>
        <p className="mt-1">
          Si un projet Pergolab est associé à <b>{email}</b>, vous allez recevoir un email
          « Accéder à mon projet » dans quelques instants. Pensez à regarder dans les
          courriers indésirables.
        </p>
        <button
          type="button"
          onClick={() => setEtat("saisie")}
          className="mt-3 text-sm font-semibold underline underline-offset-2"
        >
          Utiliser une autre adresse
        </button>
      </div>
    );

  return (
    <form onSubmit={envoyer} className="mt-6 space-y-3 rounded-xl border border-border bg-white p-5 shadow-sm">
      <label className="block text-sm font-semibold" htmlFor="email">
        Votre adresse email
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="vous@exemple.fr"
        className="w-full rounded-lg border border-border px-3 py-2.5 text-base outline-none focus:border-primary"
      />
      {etat === "erreur" ? (
        <p className="text-sm text-red-700">Adresse invalide ou service indisponible. Réessayez.</p>
      ) : null}
      <button
        type="submit"
        disabled={etat === "envoi"}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {etat === "envoi" ? <Loader2 className="size-4 animate-spin" /> : null}
        Recevoir mon lien de connexion
      </button>
    </form>
  );
}
