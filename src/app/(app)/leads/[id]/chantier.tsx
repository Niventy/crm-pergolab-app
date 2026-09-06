"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { saveChantier, type ChantierInput } from "./actions";

type Profil = { id: string; nom: string | null; email: string };

export type ChantierValues = ChantierInput;

// Suivi de chantier ÉDITABLE EN PLACE : dates prévues / réelles, poseur, équipe,
// fournisseur, adresse — sans passer par la page « Modifier » (40 champs).
export function Chantier({
  leadId,
  values,
  profiles,
  adresseClient,
}: {
  leadId: string;
  values: ChantierValues;
  profiles: Profil[];
  adresseClient: string | null;
}) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [pending, start] = useTransition();
  const [v, setV] = useState<ChantierValues>(values);
  const set = (k: keyof ChantierValues) => (val: string) =>
    setV((cur) => ({ ...cur, [k]: val || null }));

  function annuler() {
    setV(values);
    setEdit(false);
  }
  function enregistrer() {
    start(async () => {
      const r = await saveChantier(leadId, v);
      if (r.ok) {
        toast.success(r.changed?.length ? `Modifié : ${r.changed.join(", ")}` : "Aucune modification");
        setEdit(false);
        router.refresh();
      } else toast.error(r.error ?? "Échec");
    });
  }

  const poseur = profiles.find((p) => p.id === v.poseAssignedTo);

  return (
    <div>
      <div className="mb-2 flex items-center justify-end">
        {edit ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={annuler}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" /> Annuler
            </button>
            <button
              type="button"
              onClick={enregistrer}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Enregistrer
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEdit(true)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="size-3.5" /> Planifier / modifier
          </button>
        )}
      </div>

      {/* Frise des 4 jalons : prévu / réel */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Jalon
          titre="Métré"
          edit={edit}
          champs={[{ label: "Date du métré", key: "dateMetre" }]}
          v={v}
          set={set}
        />
        <Jalon
          titre="Commande fournisseur"
          edit={edit}
          champs={[{ label: "Date commande", key: "dateCommande" }]}
          v={v}
          set={set}
        />
        <Jalon
          titre="Livraison"
          edit={edit}
          champs={[
            { label: "Prévue", key: "dateLivraisonPrevue" },
            { label: "Réelle", key: "dateLivraisonReelle" },
          ]}
          v={v}
          set={set}
        />
        <Jalon
          titre="Pose"
          edit={edit}
          champs={[
            { label: "Prévue", key: "datePosePrevue" },
            { label: "Réelle", key: "datePoseReelle" },
          ]}
          v={v}
          set={set}
        />
      </div>

      {/* Qui / quoi / où */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Champ label="Poseur / métreur (membre)" edit={edit}>
          {edit ? (
            <select
              value={v.poseAssignedTo ?? ""}
              onChange={(e) => set("poseAssignedTo")(e.target.value)}
              className={inputCls}
            >
              <option value="">Non assigné</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom ?? p.email}
                </option>
              ))}
            </select>
          ) : (
            poseur?.nom ?? poseur?.email ?? <span className="text-amber-700">Non assigné</span>
          )}
        </Champ>
        <Champ label="Équipe de pose (externe)" edit={edit}>
          {edit ? (
            <input value={v.equipePose ?? ""} onChange={(e) => set("equipePose")(e.target.value)} className={inputCls} />
          ) : (
            v.equipePose || "—"
          )}
        </Champ>
        <Champ label="Fournisseur · réf. commande" edit={edit}>
          {edit ? (
            <div className="flex gap-2">
              <input
                value={v.fournisseur ?? ""}
                onChange={(e) => set("fournisseur")(e.target.value)}
                placeholder="Fournisseur"
                className={inputCls}
              />
              <input
                value={v.refCommande ?? ""}
                onChange={(e) => set("refCommande")(e.target.value)}
                placeholder="Réf."
                className={cn(inputCls, "w-28")}
              />
            </div>
          ) : (
            [v.fournisseur, v.refCommande].filter(Boolean).join(" · ") || "—"
          )}
        </Champ>
        <Champ label="Adresse de pose" edit={edit} full>
          {edit ? (
            <input
              value={v.adressePose ?? ""}
              onChange={(e) => set("adressePose")(e.target.value)}
              placeholder={adresseClient ? `vide = adresse du client (${adresseClient})` : "Adresse du chantier"}
              className={inputCls}
            />
          ) : v.adressePose ? (
            v.adressePose
          ) : adresseClient ? (
            <>
              {adresseClient}{" "}
              <span className="text-xs text-muted-foreground">(adresse du client)</span>
            </>
          ) : (
            <span className="text-amber-700">À renseigner</span>
          )}
        </Champ>
      </div>
    </div>
  );
}

const inputCls =
  "h-9 w-full rounded-md border border-border bg-white px-2 text-sm outline-none focus:border-primary";

function Jalon({
  titre,
  champs,
  edit,
  v,
  set,
}: {
  titre: string;
  champs: { label: string; key: keyof ChantierValues }[];
  edit: boolean;
  v: ChantierValues;
  set: (k: keyof ChantierValues) => (val: string) => void;
}) {
  const reel = champs.length === 2 ? v[champs[1].key] : v[champs[0].key];
  const prevu = champs.length === 2 ? v[champs[0].key] : null;
  const fait = !!reel;
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2",
        fait ? "border-green-200 bg-green-50/60" : prevu ? "border-blue-200 bg-blue-50/40" : "border-border bg-muted/30",
      )}
    >
      <div
        className={cn(
          "text-eyebrow",
          fait ? "text-green-700" : prevu ? "text-blue-700" : "text-muted-foreground",
        )}
      >
        {titre}
      </div>
      <div className="mt-1 space-y-1">
        {champs.map((c) => (
          <div key={c.key} className="flex items-center justify-between gap-2 text-sm">
            <span className="text-xs text-muted-foreground">{c.label}</span>
            {edit ? (
              <input
                type="date"
                value={(v[c.key] as string | null) ?? ""}
                onChange={(e) => set(c.key)(e.target.value)}
                className="h-8 rounded-md border border-border bg-white px-1.5 text-xs outline-none focus:border-primary"
              />
            ) : (
              <span className={cn("tabular-nums", v[c.key] ? "font-medium text-foreground" : "text-muted-foreground")}>
                {formatDate(v[c.key] as string | null)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Champ({
  label,
  children,
  full,
}: {
  label: string;
  edit: boolean;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2 lg:col-span-3" : ""}>
      <div className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm text-foreground">{children}</div>
    </div>
  );
}
