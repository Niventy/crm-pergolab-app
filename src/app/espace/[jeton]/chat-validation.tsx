"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, Loader2, Pencil, RotateCcw } from "lucide-react";
import type { PointValidation, Reponses } from "@/lib/chantier-validation";

// Chat GUIDÉ de validation du chantier (sans IA) : chaque point est présenté
// par « Pergolab », le client répond « C'est correct » ou « À corriger » (avec
// un commentaire). À la fin : accord explicite (case à cocher) si tout est bon,
// sinon envoi des corrections au conseiller. Une seule requête à la fin.
export function ChatValidation({
  jeton,
  validationId,
  points,
  prenom,
  conseiller,
}: {
  jeton: string;
  validationId: string;
  points: PointValidation[];
  prenom: string;
  conseiller: string | null;
}) {
  const router = useRouter();
  const [reponses, setReponses] = useState<Reponses>({});
  const [enCorrection, setEnCorrection] = useState(false);
  const [commentaire, setCommentaire] = useState("");
  const [accord, setAccord] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);

  const idx = points.findIndex((p) => !reponses[p.cle]);
  const termine = idx === -1;
  const courant = termine ? null : points[idx];
  const corrections = points.filter((p) => reponses[p.cle]?.ok === false);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [idx, enCorrection]);

  function repondre(ok: boolean) {
    if (!courant) return;
    setReponses((r) => ({ ...r, [courant.cle]: { ok, commentaire: ok ? null : commentaire.trim() } }));
    setEnCorrection(false);
    setCommentaire("");
  }

  function recommencer() {
    setReponses({});
    setAccord(false);
    setErreur(null);
  }

  async function envoyer() {
    setEnvoi(true);
    setErreur(null);
    try {
      const res = await fetch(`/espace/${jeton}/validation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ validationId, reponses, accord }),
      });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !j?.ok) {
        setErreur(j?.error ?? "L'envoi a échoué, réessayez dans un instant.");
        setEnvoi(false);
        return;
      }
      router.refresh();
    } catch {
      setErreur("Connexion impossible, réessayez dans un instant.");
      setEnvoi(false);
    }
  }

  return (
    <div className="space-y-3">
      <Bulle>
        {`Bonjour ${prenom}, avant de lancer la fabrication de votre pergola, merci de vérifier avec nous les ${points.length} points ci-dessous. Répondez simplement « C'est correct » ou « À corriger ».`}
      </Bulle>

      {points.slice(0, termine ? points.length : idx + 1).map((p) => {
        const r = reponses[p.cle];
        return (
          <div key={p.cle} className="space-y-3">
            <Bulle>
              <PointContenu p={p} jeton={jeton} />
            </Bulle>
            {r ? (
              <BulleClient>
                {r.ok ? (
                  <span className="inline-flex items-center gap-1">
                    <Check className="size-4" /> C&apos;est correct
                  </span>
                ) : (
                  <>
                    <span className="font-semibold">À corriger :</span> {r.commentaire}
                  </>
                )}
              </BulleClient>
            ) : null}
          </div>
        );
      })}

      {courant ? (
        enCorrection ? (
          <div className="ml-auto max-w-[85%] space-y-2">
            <textarea
              autoFocus
              rows={3}
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              placeholder="Que faut-il corriger ?"
              className="w-full resize-none rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEnCorrection(false)}
                className="rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
              >
                Retour
              </button>
              <button
                type="button"
                disabled={!commentaire.trim()}
                onClick={() => repondre(false)}
                className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
              >
                Envoyer
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setEnCorrection(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-4 py-2 text-sm font-semibold hover:bg-muted"
            >
              <Pencil className="size-4" /> À corriger
            </button>
            <button
              type="button"
              onClick={() => repondre(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Check className="size-4" /> C&apos;est correct
            </button>
          </div>
        )
      ) : (
        <>
          {corrections.length === 0 ? (
            <>
              <Bulle>
                Merci ! Tout est conforme. Pour lancer la fabrication, confirmez votre accord
                ci-dessous.
              </Bulle>
              <label className="flex items-start gap-2 rounded-xl border border-border bg-white p-3 text-sm">
                <input
                  type="checkbox"
                  checked={accord}
                  onChange={(e) => setAccord(e.target.checked)}
                  className="mt-0.5 size-4 accent-[var(--primary)]"
                />
                <span>
                  Je confirme que les informations ci-dessus (adresse, dimensions, pose,
                  modèle, équipements et documents) sont exactes et je donne mon accord pour
                  lancer la fabrication.
                </span>
              </label>
            </>
          ) : (
            <Bulle>
              Merci ! Nous transmettons {corrections.length > 1 ? "vos" : "votre"}{" "}
              {corrections.length} correction{corrections.length > 1 ? "s" : ""} à{" "}
              {conseiller ?? "votre conseiller"}, qui reviendra vers vous rapidement.
            </Bulle>
          )}
          {erreur ? <p className="text-sm font-medium text-red-700">{erreur}</p> : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={recommencer}
              disabled={envoi}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="size-4" /> Modifier mes réponses
            </button>
            <button
              type="button"
              onClick={envoyer}
              disabled={envoi || (corrections.length === 0 && !accord)}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              {envoi ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {corrections.length === 0 ? "Valider mon chantier" : "Envoyer à mon conseiller"}
            </button>
          </div>
        </>
      )}
      <div ref={finRef} />
    </div>
  );
}

function PointContenu({ p, jeton }: { p: PointValidation; jeton: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-bold uppercase tracking-wider text-primary">{p.titre}</p>
      {p.documentId ? (
        <a
          href={`/espace/${jeton}/document/${p.documentId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 font-semibold text-primary underline-offset-2 hover:underline"
        >
          <FileText className="size-4" /> Ouvrir « {p.documentNom} »
        </a>
      ) : (
        <ul className="space-y-0.5">
          {p.lignes.map((l, i) => (
            <li key={i} className="whitespace-pre-line">
              {l}
            </li>
          ))}
        </ul>
      )}
      {p.documentId ? (
        <p className="mt-1 text-xs text-muted-foreground">Consultez le document, puis répondez.</p>
      ) : null}
    </div>
  );
}

function Bulle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-end gap-2">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
        PL
      </span>
      <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-slate-100 px-3.5 py-2.5 text-sm text-foreground">
        {children}
      </div>
    </div>
  );
}

function BulleClient({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2.5 text-sm text-primary-foreground">
        {children}
      </div>
    </div>
  );
}
