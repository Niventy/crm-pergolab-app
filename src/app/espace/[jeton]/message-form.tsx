"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";

// « Une question, un commentaire ? » : le message arrive dans le fil d'activité
// de la fiche (CRM) et notifie le conseiller.
export function MessageForm({ jeton, conseiller }: { jeton: string; conseiller: string | null }) {
  const [message, setMessage] = useState("");
  const [etat, setEtat] = useState<"saisie" | "envoi" | "envoye">("saisie");
  const [erreur, setErreur] = useState<string | null>(null);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    setEtat("envoi");
    setErreur(null);
    try {
      const res = await fetch(`/espace/${jeton}/commentaire`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !j?.ok) {
        setErreur(j?.error ?? "L'envoi a échoué, réessayez dans un instant.");
        setEtat("saisie");
        return;
      }
      setMessage("");
      setEtat("envoye");
    } catch {
      setErreur("Connexion impossible, réessayez dans un instant.");
      setEtat("saisie");
    }
  }

  if (etat === "envoye")
    return (
      <div className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
        <div>
          Message envoyé ! {conseiller ?? "Votre conseiller"} vous répond rapidement.{" "}
          <button type="button" onClick={() => setEtat("saisie")} className="font-semibold underline underline-offset-2">
            Écrire un autre message
          </button>
        </div>
      </div>
    );

  return (
    <form onSubmit={envoyer} className="space-y-2">
      <textarea
        rows={3}
        maxLength={2000}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Une question sur votre projet, une précision pour la pose, un commentaire…"
        className="w-full resize-none rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
      />
      {erreur ? <p className="text-sm text-red-700">{erreur}</p> : null}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={etat === "envoi" || !message.trim()}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
        >
          {etat === "envoi" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Envoyer
        </button>
      </div>
    </form>
  );
}
