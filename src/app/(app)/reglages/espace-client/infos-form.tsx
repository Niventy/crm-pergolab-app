"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ContactConfiance, InfosEntreprise } from "@/lib/infos-entreprise";
import { enregistrerInfosEspace } from "./actions";

const INPUT =
  "w-full rounded-md border border-border bg-white px-2.5 py-1.5 text-sm outline-none focus:border-primary";

function Champ({
  label,
  value,
  onChange,
  placeholder,
  long,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  long?: boolean;
  rows?: number;
}) {
  return (
    <label className="block text-xs font-medium text-muted-foreground">
      {label}
      {long ? (
        <textarea
          rows={rows}
          className={INPUT + " mt-1 resize-y"}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className={INPUT + " mt-1"}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}

function Section({ titre, aide, children }: { titre: string; aide?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-white p-5">
      <div>
        <h2 className="text-sm font-bold">{titre}</h2>
        {aide ? <p className="text-xs text-muted-foreground">{aide}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function InfosEspaceForm({ initial }: { initial: InfosEntreprise }) {
  const [f, setF] = useState<InfosEntreprise>(initial);
  const [pending, start] = useTransition();
  const set = <K extends keyof InfosEntreprise>(k: K) => (v: InfosEntreprise[K]) =>
    setF((x) => ({ ...x, [k]: v }));
  const setContact = (i: number, k: keyof ContactConfiance, v: string) =>
    setF((x) => ({ ...x, contacts: x.contacts.map((c, j) => (j === i ? { ...c, [k]: v } : c)) }));

  function enregistrer() {
    start(async () => {
      const r = await enregistrerInfosEspace(f);
      if (r.ok) toast.success("Infos de l'espace client enregistrées");
      else toast.error(r.error ?? "Échec");
    });
  }

  return (
    <div className="space-y-4">
      <Section
        titre="Contacts de confiance"
        aide="Les personnes que le client peut appeler. Le téléphone s'affiche en bouton « Appeler »."
      >
        {f.contacts.map((c, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
            <Champ label="Nom" value={c.nom} onChange={(v) => setContact(i, "nom", v)} />
            <Champ label="Rôle" value={c.role} onChange={(v) => setContact(i, "role", v)} placeholder="ex. Votre conseiller" />
            <Champ label="Téléphone" value={c.telephone} onChange={(v) => setContact(i, "telephone", v)} placeholder="06 …" />
            <Champ label="Email" value={c.email} onChange={(v) => setContact(i, "email", v)} />
            <button
              type="button"
              onClick={() => setF((x) => ({ ...x, contacts: x.contacts.filter((_, j) => j !== i) }))}
              className="self-end rounded-md p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600"
              aria-label={`Retirer ${c.nom || "ce contact"}`}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        {f.contacts.length < 6 ? (
          <button
            type="button"
            onClick={() =>
              setF((x) => ({ ...x, contacts: [...x.contacts, { nom: "", role: "", telephone: "", email: "" }] }))
            }
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
          >
            <Plus className="size-4" /> Ajouter un contact
          </button>
        ) : null}
      </Section>

      <Section titre="L'entreprise" aide="Identité légale affichée au client pour le rassurer.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Champ label="Raison sociale" value={f.raisonSociale} onChange={set("raisonSociale")} />
          <Champ label="SIRET" value={f.siret} onChange={set("siret")} />
          <Champ label="N° TVA intracommunautaire" value={f.tvaIntracom} onChange={set("tvaIntracom")} />
          <Champ label="Adresse du siège" value={f.adresse} onChange={set("adresse")} />
          <Champ label="Téléphone de l'entreprise" value={f.telephone} onChange={set("telephone")} />
          <Champ label="Email de l'entreprise" value={f.email} onChange={set("email")} />
          <Champ label="Site web" value={f.siteWeb} onChange={set("siteWeb")} placeholder="https://…" />
          <Champ
            label="Assurance"
            value={f.assurance}
            onChange={set("assurance")}
            placeholder="ex. Garantie décennale — assureur, n° de police"
          />
        </div>
      </Section>

      <Section titre="Garanties & conditions" aide="Texte libre ; les retours à la ligne sont conservés.">
        <Champ
          label="Garanties"
          long
          value={f.garanties}
          onChange={set("garanties")}
          placeholder="ex. Structure aluminium garantie 10 ans, motorisation 5 ans…"
        />
        <Champ
          label="Conditions (résumé des CGV)"
          long
          rows={6}
          value={f.conditions}
          onChange={set("conditions")}
          placeholder="Paiement, délais, droit de rétractation, médiateur…"
        />
        <Champ
          label="Lien vers les CGV complètes (facultatif)"
          value={f.lienConditions}
          onChange={set("lienConditions")}
          placeholder="https://…"
        />
      </Section>

      <div className="sticky bottom-24 flex justify-end">
        <button
          type="button"
          onClick={enregistrer}
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
        >
          Enregistrer
        </button>
      </div>
    </div>
  );
}
