"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, FileText, Home, Loader2, Pencil } from "lucide-react";
import type { PointValidation, Reponses } from "@/lib/chantier-validation";
import {
  COTE_LABEL,
  COTES,
  coteMaisonParDefaut,
  OUVERTURES,
  SOLS,
  type Cote,
  type DetailsClient,
  type SchemaProduction,
} from "@/lib/schema-production";

// Formulaire « Validez votre schéma de production » (espace client). Même
// logique visuelle que le configurateur de pergolab.fr (vue 3D + un choix par
// côté), pré-rempli depuis le devis signé et le métré : le client vérifie
// chaque point (Conforme / À corriger), précise les détails de pose (côté
// maison, lames, sol, photos), puis donne son accord. Une seule requête à la fin.
export function SchemaForm({
  jeton,
  validationId,
  points,
  schema,
  conseiller,
  photosActives,
}: {
  jeton: string;
  validationId: string;
  points: PointValidation[];
  schema: SchemaProduction | null;
  conseiller: string | null;
  photosActives: boolean;
}) {
  const router = useRouter();
  const [reponses, setReponses] = useState<Reponses>({});
  const [details, setDetails] = useState<DetailsClient>({
    coteMaison: coteMaisonParDefaut(schema),
    ouvertureLames: null,
    sol: null,
    solPrecision: null,
    hauteurDispoMm: null,
    photos: [],
  });
  const [photos, setPhotos] = useState<{ id: string; apercu: string }[]>([]);
  const [envoiPhoto, setEnvoiPhoto] = useState(false);
  const [accord, setAccord] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const repondus = points.filter((p) => reponses[p.cle]).length;
  const corrections = points.filter((p) => reponses[p.cle]?.ok === false);
  const commentaireManquant = corrections.some((p) => !reponses[p.cle]?.commentaire?.trim());
  const detailsManquants = !schema
    ? []
    : [
        schema.pose === "adossee" && !details.coteMaison ? "le côté de votre maison" : null,
        schema.lames && !details.ouvertureLames ? "le sens d'ouverture des lames" : null,
        !details.sol ? "le type de sol" : null,
      ].filter((x): x is string => !!x);
  const pret =
    repondus === points.length &&
    !commentaireManquant &&
    detailsManquants.length === 0 &&
    (corrections.length > 0 || accord);

  const setRep = (cle: string, ok: boolean) =>
    setReponses((r) => ({ ...r, [cle]: { ok, commentaire: ok ? null : (r[cle]?.commentaire ?? "") } }));
  const setCom = (cle: string, commentaire: string) =>
    setReponses((r) => ({ ...r, [cle]: { ok: false, commentaire } }));
  const setD = <K extends keyof DetailsClient>(k: K, v: DetailsClient[K]) => setDetails((d) => ({ ...d, [k]: v }));

  async function ajouterPhotos(files: FileList | null) {
    if (!files?.length) return;
    setEnvoiPhoto(true);
    setErreur(null);
    for (const f of Array.from(files).slice(0, 10)) {
      try {
        const blob = await reduireImage(f);
        const fd = new FormData();
        fd.append("file", blob, f.name.replace(/\.\w+$/, "") + ".jpg");
        const res = await fetch(`/espace/${jeton}/photo`, { method: "POST", body: fd });
        const j = (await res.json().catch(() => null)) as { ok?: boolean; id?: string; error?: string } | null;
        if (!res.ok || !j?.ok || !j.id) {
          setErreur(j?.error ?? "L'envoi d'une photo a échoué.");
          continue;
        }
        const id = j.id;
        setPhotos((p) => [...p, { id, apercu: URL.createObjectURL(blob) }]);
        setDetails((d) => ({ ...d, photos: [...d.photos, id] }));
      } catch {
        setErreur("Cette photo n'a pas pu être lue. Essayez une capture JPG.");
      }
    }
    setEnvoiPhoto(false);
  }

  async function envoyer() {
    setEnvoi(true);
    setErreur(null);
    try {
      const res = await fetch(`/espace/${jeton}/validation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ validationId, reponses, details, accord }),
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
    <div className="space-y-6">
      {/* 1 · Le schéma */}
      {schema ? (
        <section className="space-y-3">
          <Titre n={1}>Votre pergola</Titre>
          <div className="rounded-xl bg-slate-50 p-3">
            <SchemaSVG schema={schema} coteMaison={details.coteMaison} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {COTES.map((c) => {
              const maison = details.coteMaison === c;
              const f = schema.fermetures[c];
              return (
                <div
                  key={c}
                  className={`rounded-lg border p-2.5 text-xs ${
                    maison ? "border-amber-300 bg-amber-50" : f.length ? "border-primary/40 bg-primary/5" : "border-border bg-white"
                  }`}
                >
                  <p className="font-bold uppercase tracking-wider text-muted-foreground">
                    {COTE_LABEL[c]}
                    <span className="font-normal normal-case tracking-normal">
                      {" "}· {c === "front" || c === "back" ? "largeur" : "avancée"}
                    </span>
                  </p>
                  {maison ? (
                    <p className="mt-1 flex items-center gap-1 font-semibold text-amber-900">
                      <Home className="size-3.5" /> Mur de la maison
                    </p>
                  ) : f.length ? (
                    f.map((x, i) => (
                      <p key={i} className="mt-1 font-semibold">
                        {x.label}
                        {x.qte > 1 ? ` × ${x.qte}` : ""}
                      </p>
                    ))
                  ) : (
                    <p className="mt-1 text-muted-foreground">Ouvert</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* 2 · Points à vérifier */}
      <section className="space-y-3">
        <Titre n={schema ? 2 : 1}>
          Vérifiez chaque point{" "}
          <span className="font-normal text-muted-foreground">
            ({repondus}/{points.length})
          </span>
        </Titre>
        {points.map((p) => {
          const r = reponses[p.cle];
          return (
            <div
              key={p.cle}
              className={`rounded-xl border p-3 ${
                r?.ok === true ? "border-emerald-300 bg-emerald-50/50" : r?.ok === false ? "border-amber-300 bg-amber-50/50" : "border-border bg-white"
              }`}
            >
              <PointContenu p={p} jeton={jeton} />
              <div className="mt-2.5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRep(p.cle, false)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    r?.ok === false ? "border-amber-500 bg-amber-500 text-white" : "border-border bg-white hover:bg-muted"
                  }`}
                >
                  <Pencil className="size-3.5" /> À corriger
                </button>
                <button
                  type="button"
                  onClick={() => setRep(p.cle, true)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    r?.ok === true ? "border-emerald-600 bg-emerald-600 text-white" : "border-border bg-white hover:bg-muted"
                  }`}
                >
                  <Check className="size-3.5" /> Conforme
                </button>
              </div>
              {r?.ok === false ? (
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={r.commentaire ?? ""}
                  onChange={(e) => setCom(p.cle, e.target.value)}
                  placeholder="Que faut-il corriger ?"
                  className="mt-2 w-full resize-none rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
                />
              ) : null}
            </div>
          );
        })}
      </section>

      {/* 3 · Précisions de pose */}
      {schema ? (
        <section className="space-y-4">
          <Titre n={3}>Précisions pour la pose</Titre>

          {schema.pose === "adossee" ? (
            <Question label="De quel côté se trouve le mur de votre maison ?" aide="Vu depuis le jardin, face à la pergola.">
              <Choix
                options={COTES.map((c) => ({ id: c, label: COTE_LABEL[c] }))}
                valeur={details.coteMaison}
                onChange={(v) => setD("coteMaison", v as Cote)}
              />
            </Question>
          ) : null}

          {schema.lames ? (
            <Question
              label="Vers où les lames doivent-elles s'ouvrir ?"
              aide="Côté vers lequel l'eau s'écoule et la lumière entre quand les lames sont entrouvertes."
            >
              <Choix
                options={OUVERTURES.map((o) => ({ id: o.id, label: o.label }))}
                valeur={details.ouvertureLames}
                onChange={(v) => setD("ouvertureLames", v as DetailsClient["ouvertureLames"])}
              />
            </Question>
          ) : null}

          <Question label="Sur quel sol sera posée la pergola ?" aide="Pour prévoir la fixation des poteaux.">
            <Choix
              options={SOLS.map((s) => ({ id: s.id, label: s.label }))}
              valeur={details.sol}
              onChange={(v) => setD("sol", v as DetailsClient["sol"])}
            />
            <input
              value={details.solPrecision ?? ""}
              maxLength={500}
              onChange={(e) => setD("solPrecision", e.target.value || null)}
              placeholder="Précision (épaisseur de la dalle, pente, marches…) — facultatif"
              className="mt-2 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </Question>

          <Question
            label="Hauteur disponible (facultatif)"
            aide="Sous la gouttière, un volet roulant ou une fenêtre, à l'endroit le plus bas, en millimètres."
          >
            <div className="flex items-center gap-2">
              <input
                inputMode="numeric"
                value={details.hauteurDispoMm ?? ""}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/\D/g, ""));
                  setD("hauteurDispoMm", n > 0 ? Math.min(n, 19_999) : null);
                }}
                placeholder="ex. 2600"
                className="w-32 rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <span className="text-sm text-muted-foreground">mm</span>
            </div>
          </Question>

          <Question
            label="Photos de l'emplacement (facultatif)"
            aide="Le mur, le sol et les accès : elles aident le poseur à préparer l'intervention."
          >
            {photosActives ? (
              <div className="flex flex-wrap gap-2">
                {photos.map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob:)
                  <img key={p.id} src={p.apercu} alt="" className="size-20 rounded-lg border border-border object-cover" />
                ))}
                <label className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-white text-[11px] text-muted-foreground hover:bg-muted">
                  {envoiPhoto ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
                  Ajouter
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    disabled={envoiPhoto}
                    onChange={(e) => {
                      void ajouterPhotos(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Vous pouvez envoyer vos photos à {conseiller ?? "votre conseiller"} par email ou par SMS.
              </p>
            )}
          </Question>
        </section>
      ) : null}

      {/* 4 · Accord */}
      <section className="space-y-3 border-t border-border pt-4">
        {repondus < points.length ? (
          <p className="text-sm text-muted-foreground">
            Il reste {points.length - repondus} point{points.length - repondus > 1 ? "s" : ""} à vérifier.
          </p>
        ) : corrections.length ? (
          <p className="text-sm">
            {corrections.length} point{corrections.length > 1 ? "s" : ""} à corriger : nous transmettons vos
            remarques à {conseiller ?? "votre conseiller"}, qui reviendra vers vous avec un schéma mis à jour.
          </p>
        ) : (
          <label className="flex items-start gap-2 rounded-xl border border-border bg-white p-3 text-sm">
            <input
              type="checkbox"
              checked={accord}
              onChange={(e) => setAccord(e.target.checked)}
              className="mt-0.5 size-4 accent-[var(--primary)]"
            />
            <span>
              Je confirme que ce schéma de production (dimensions, pose, modèle, coloris, fermetures,
              équipements et documents) est exact et je donne mon accord pour lancer la fabrication.
            </span>
          </label>
        )}
        {detailsManquants.length && repondus === points.length ? (
          <p className="text-sm text-amber-700">Précisez encore {detailsManquants.join(", ")}.</p>
        ) : null}
        {commentaireManquant ? (
          <p className="text-sm text-amber-700">Décrivez chaque correction demandée.</p>
        ) : null}
        {erreur ? <p className="text-sm font-medium text-red-700">{erreur}</p> : null}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={envoyer}
            disabled={envoi || envoiPhoto || !pret}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            {envoi ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {corrections.length ? "Envoyer mes corrections" : "Valider mon schéma de production"}
          </button>
        </div>
      </section>
    </div>
  );
}

// ── Vue 3D (même perspective que le configurateur de pergolab.fr) ─────────────
const MURS: Record<Cote, string> = {
  front: "M60,42 L170,32 L170,88 L60,98 Z",
  back: "M40,20 L150,10 L150,66 L40,76 Z",
  left: "M40,20 L60,42 L60,98 L40,76 Z",
  right: "M150,10 L170,32 L170,88 L150,66 Z",
};
// Mur de maison : même face, prolongée vers le haut.
const MAISON: Record<Cote, string> = {
  front: "M60,30 L170,20 L170,98 L60,108 Z",
  back: "M40,4 L150,-6 L150,66 L40,76 Z",
  left: "M40,6 L60,28 L60,98 L40,76 Z",
  right: "M150,-4 L170,18 L170,88 L150,66 Z",
};
// Poteaux aux 4 angles : arrière-gauche, avant-gauche, arrière-droit, avant-droit.
const POTEAUX: [number, number][] = [
  [38, 20],
  [58, 42],
  [148, 10],
  [168, 32],
];
const ANGLES_DU_COTE: Record<Cote, number[]> = { front: [1, 3], back: [0, 2], left: [0, 1], right: [2, 3] };

function SchemaSVG({ schema, coteMaison }: { schema: SchemaProduction; coteMaison: Cote | null }) {
  const sansPoteau = new Set(coteMaison ? ANGLES_DU_COTE[coteMaison] : []);
  const mm = (v: number | null) => (v ? `${v.toLocaleString("fr-FR")} mm` : "—");
  // Mur de maison dessiné en premier s'il est derrière (arrière / gauche), en dernier sinon.
  const maisonDevant = coteMaison === "front" || coteMaison === "right";
  const maison = coteMaison ? (
    <g>
      <path d={MAISON[coteMaison]} fill="url(#briques)" stroke="#b45309" strokeWidth="1" opacity={maisonDevant ? 0.55 : 1} />
    </g>
  ) : null;
  return (
    <svg viewBox="0 -10 222 128" className="mx-auto w-full max-w-md" role="img" aria-label={`Schéma : ${schema.modele}`}>
      <defs>
        <pattern id="briques" width="8" height="5" patternUnits="userSpaceOnUse">
          <rect width="8" height="5" fill="#fde7c7" />
          <path d="M0 0H8M0 2.5H8M2 0V2.5M6 2.5V5" stroke="#e8b97a" strokeWidth="0.5" />
        </pattern>
      </defs>
      {!maisonDevant ? maison : null}
      {COTES.filter((c) => c !== coteMaison).map((c) => {
        const ferme = schema.fermetures[c].length > 0;
        return (
          <path
            key={c}
            d={MURS[c]}
            fill={ferme ? "rgba(30,58,47,0.28)" : "rgba(148,163,184,0.06)"}
            stroke={ferme ? "#1e3a2f" : "#cbd5e1"}
            strokeWidth={ferme ? 1.6 : 0.8}
            strokeDasharray={ferme ? undefined : "4 3"}
          />
        );
      })}
      <path d="M40,20 L150,10 L170,32 L60,42 Z" fill={schema.lames ? "#e2e8f0" : "#cbd5e1"} stroke="#4e4e4e" strokeWidth="1.5" />
      {schema.lames
        ? Array.from({ length: 9 }, (_, i) => {
            const t = (i + 1) / 10;
            return (
              <line
                key={i}
                x1={40 + 20 * t}
                y1={20 + 22 * t}
                x2={150 + 20 * t}
                y2={10 + 22 * t}
                stroke="#94a3b8"
                strokeWidth="0.7"
              />
            );
          })
        : null}
      {POTEAUX.map(([x, y], i) =>
        sansPoteau.has(i) ? null : <rect key={i} x={x} y={y} width="4" height="56" fill="#333" rx="1" />,
      )}
      {maisonDevant ? maison : null}
      {coteMaison ? (
        <text
          x={{ front: 115, back: 95, left: 50, right: 160 }[coteMaison]}
          y={{ front: 104, back: 2, left: 4, right: 0 }[coteMaison]}
          textAnchor="middle"
          fontSize="6"
          fontWeight="700"
          fill="#92400e"
        >
          MAISON
        </text>
      ) : null}
      <text x="115" y="114" textAnchor="middle" fontSize="6.5" fill="#334155">
        Largeur {mm(schema.largeurMm)}
      </text>
      <text x="190" y="62" textAnchor="middle" fontSize="6.5" fill="#334155" transform="rotate(48 190 62)">
        Avancée {mm(schema.avanceeMm)}
      </text>
    </svg>
  );
}

// ── Petits composants ────────────────────────────────────────────────────────
function Titre({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-bold">
      <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
        {n}
      </span>
      {children}
    </h3>
  );
}

function Question({ label, aide, children }: { label: string; aide?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-semibold">{label}</p>
      {aide ? <p className="mb-2 text-xs text-muted-foreground">{aide}</p> : <div className="mb-2" />}
      {children}
    </div>
  );
}

function Choix({
  options,
  valeur,
  onChange,
}: {
  options: { id: string; label: string }[];
  valeur: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`rounded-full border px-3 py-1.5 text-sm ${
            valeur === o.id ? "border-primary bg-primary font-semibold text-primary-foreground" : "border-border bg-white hover:bg-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PointContenu({ p, jeton }: { p: PointValidation; jeton: string }) {
  return (
    <div className="text-sm">
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
    </div>
  );
}

// Réduit une photo (≤ 2000 px, JPEG) : les photos de téléphone dépassent
// souvent la limite de 4,5 Mo par requête de Vercel.
async function reduireImage(f: File): Promise<Blob> {
  const bmp = await createImageBitmap(f);
  const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return new Promise((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error("toBlob"))), "image/jpeg", 0.85));
}

