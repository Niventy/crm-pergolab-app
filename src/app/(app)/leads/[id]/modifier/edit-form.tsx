"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Lead, Stage, Profile } from "@/db/schema";
import { updateLead, type LeadEditInput } from "./actions";

const NONE = "__none__";

// Convertit un timestamp en valeur d'input <input type="datetime-local">.
function toDateTimeLocal(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function EditForm({
  lead,
  stages,
  profiles,
}: {
  lead: Lead;
  stages: Stage[];
  profiles: Profile[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [form, setForm] = useState<LeadEditInput>({
    nom: lead.nom ?? "",
    entreprise: lead.entreprise ?? "",
    email: lead.email ?? "",
    telephone: lead.telephone ?? "",
    source: lead.source ?? "",
    campagne: lead.campagne ?? "",
    montant: lead.montant ?? "",
    probabilite: lead.probabilite?.toString() ?? "",
    objectifDate: lead.objectifDate ?? "",
    typeProjet: lead.typeProjet ?? "",
    codePostal: lead.codePostal ?? "",
    dateInstallation: lead.dateInstallation ?? "",
    dateSouhaiteeAppel: lead.dateSouhaiteeAppel ?? "",
    stageId: lead.stageId ?? "",
    assignedTo: lead.assignedTo ?? "",
    rdvDate: lead.rdvDate ?? "",
    rdvType: lead.rdvType ?? "",
    rdvStatut: lead.rdvStatut ?? "",
    nextRelanceDate: lead.nextRelanceDate ?? "",
    relanceCount: lead.relanceCount?.toString() ?? "0",
    // Métriques commerciales
    datePremierContact: toDateTimeLocal(lead.datePremierContact),
    raisonPerte: lead.raisonPerte ?? "",
    modePaiement: lead.modePaiement ?? "",
    acompte: lead.acompte ?? "",
    montantAchat: lead.montantAchat ?? "",
    // Produit
    gamme: lead.gamme ?? "",
    dimensions: lead.dimensions ?? "",
    finition: lead.finition ?? "",
    options: lead.options ?? "",
    typePose: lead.typePose ?? "",
    // Pose & technique
    poseAssignedTo: lead.poseAssignedTo ?? "",
    dateMetre: lead.dateMetre ?? "",
    fournisseur: lead.fournisseur ?? "",
    refCommande: lead.refCommande ?? "",
    dateCommande: lead.dateCommande ?? "",
    dateLivraisonPrevue: lead.dateLivraisonPrevue ?? "",
    dateLivraisonReelle: lead.dateLivraisonReelle ?? "",
    datePosePrevue: lead.datePosePrevue ?? "",
    datePoseReelle: lead.datePoseReelle ?? "",
    adressePose: lead.adressePose ?? "",
  });

  const set = (k: keyof LeadEditInput) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Cycle de l'étape sélectionnée → sections affichées (1=prospection, 2=devis, 3=pose).
  const cycle = stages.find((s) => s.id === form.stageId)?.cycle ?? 1;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nom.trim()) {
      toast.error("Le nom est requis.");
      return;
    }
    startTransition(async () => {
      try {
        await updateLead(lead.id, form);
      } catch (err) {
        // redirect() lève une exception interceptée par Next : on l'ignore.
        if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT"))
          return;
        toast.error("Échec de l'enregistrement.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Section title="Identité">
        <FieldText label="Nom" value={form.nom} onChange={set("nom")} required />
        <FieldText label="Entreprise" value={form.entreprise} onChange={set("entreprise")} />
        <FieldText label="Email" type="email" value={form.email} onChange={set("email")} />
        <FieldText label="Téléphone" value={form.telephone} onChange={set("telephone")} />
      </Section>

      <Section title="Pipeline">
        <FieldSelect
          label="Étape"
          value={form.stageId || NONE}
          onChange={(v) => set("stageId")(v === NONE ? "" : v)}
          options={[
            { value: NONE, label: "—" },
            ...stages.map((s) => ({ value: s.id, label: s.nom })),
          ]}
        />
        <FieldSelect
          label="Responsable"
          value={form.assignedTo || NONE}
          onChange={(v) => set("assignedTo")(v === NONE ? "" : v)}
          options={[
            { value: NONE, label: "Non assigné" },
            ...profiles.map((p) => ({ value: p.id, label: p.nom ?? p.email })),
          ]}
        />
        <FieldText
          label="Montant (€)"
          type="number"
          value={form.montant}
          onChange={set("montant")}
        />
        <FieldText
          label="Probabilité (%)"
          type="number"
          value={form.probabilite}
          onChange={set("probabilite")}
        />
        <FieldText
          label="Objectif (date)"
          type="date"
          value={form.objectifDate}
          onChange={set("objectifDate")}
        />
      </Section>

      <Section title="Projet">
        <FieldText label="Type de projet" value={form.typeProjet} onChange={set("typeProjet")} />
        <FieldText label="Code postal" value={form.codePostal} onChange={set("codePostal")} />
        <FieldText
          label="Installation souhaitée"
          placeholder="ex. le plus rapidement possible"
          value={form.dateInstallation}
          onChange={set("dateInstallation")}
        />
        <FieldText
          label="Appel souhaité (créneau)"
          placeholder="ex. après-midi (14h-18h)"
          value={form.dateSouhaiteeAppel}
          onChange={set("dateSouhaiteeAppel")}
        />
        <FieldText label="Source" value={form.source} onChange={set("source")} />
        <FieldText label="Campagne" value={form.campagne} onChange={set("campagne")} />
      </Section>

      {cycle <= 2 ? (
      <>
      <Section title="Rendez-vous">
        <FieldText label="Date du RDV" type="date" value={form.rdvDate} onChange={set("rdvDate")} />
        <FieldSelect
          label="Type"
          value={form.rdvType || NONE}
          onChange={(v) => set("rdvType")(v === NONE ? "" : v)}
          options={[
            { value: NONE, label: "—" },
            { value: "physique", label: "physique" },
            { value: "visio", label: "visio" },
          ]}
        />
        <FieldSelect
          label="Statut"
          value={form.rdvStatut || NONE}
          onChange={(v) => set("rdvStatut")(v === NONE ? "" : v)}
          options={[
            { value: NONE, label: "—" },
            { value: "prevu", label: "prévu" },
            { value: "a_reprogrammer", label: "à reprogrammer" },
            { value: "honore", label: "honoré" },
          ]}
        />
      </Section>

      <Section title="Relance">
        <FieldText
          label="Prochaine relance"
          type="date"
          value={form.nextRelanceDate}
          onChange={set("nextRelanceDate")}
        />
        <FieldText
          label="Nombre de relances"
          type="number"
          value={form.relanceCount}
          onChange={set("relanceCount")}
        />
      </Section>
      </>
      ) : null}

      {cycle >= 2 ? (
      <Section title="Suivi commercial">
        <FieldText
          label="Date du 1er contact"
          type="datetime-local"
          value={form.datePremierContact}
          onChange={set("datePremierContact")}
        />
        <FieldSelect
          label="Mode de paiement"
          value={form.modePaiement || NONE}
          onChange={(v) => set("modePaiement")(v === NONE ? "" : v)}
          options={[
            { value: NONE, label: "—" },
            { value: "comptant", label: "Comptant" },
            { value: "financement_60", label: "Financement 60 mois" },
            { value: "financement_120", label: "Financement 120 mois" },
          ]}
        />
        <FieldText
          label="Acompte versé (€)"
          type="number"
          value={form.acompte}
          onChange={set("acompte")}
        />
        <FieldSelect
          label="Raison de perte (si KO)"
          value={form.raisonPerte || NONE}
          onChange={(v) => set("raisonPerte")(v === NONE ? "" : v)}
          options={[
            { value: NONE, label: "—" },
            { value: "prix", label: "Prix" },
            { value: "delai", label: "Délai" },
            { value: "concurrent", label: "Concurrent" },
            { value: "injoignable", label: "Injoignable" },
            { value: "annule", label: "Projet annulé" },
            { value: "non_qualifie", label: "Non qualifié" },
            { value: "autre", label: "Autre" },
          ]}
        />
      </Section>
      ) : null}

      {cycle >= 2 ? (
      <Section title="Produit">
        <FieldSelect
          label="Gamme"
          value={form.gamme || NONE}
          onChange={(v) => set("gamme")(v === NONE ? "" : v)}
          options={[
            { value: NONE, label: "—" },
            { value: "Essentia", label: "Essentia" },
            { value: "Horizon", label: "Horizon" },
            { value: "Signature", label: "Signature" },
            { value: "Sur mesure", label: "Sur mesure" },
          ]}
        />
        <FieldText label="Dimensions" value={form.dimensions} onChange={set("dimensions")} />
        <FieldText label="Finition" value={form.finition} onChange={set("finition")} />
        <FieldSelect
          label="Type de pose"
          value={form.typePose || NONE}
          onChange={(v) => set("typePose")(v === NONE ? "" : v)}
          options={[
            { value: NONE, label: "—" },
            { value: "autoportee", label: "Autoportée" },
            { value: "adossee", label: "Adossée" },
          ]}
        />
        <FieldText label="Options" value={form.options} onChange={set("options")} />
        <FieldText
          label="Coût d'achat fournisseur (€)"
          type="number"
          value={form.montantAchat}
          onChange={set("montantAchat")}
        />
      </Section>
      ) : null}

      {cycle === 3 ? (
      <Section title="Pose & technique">
        <FieldSelect
          label="Poseur / métreur"
          value={form.poseAssignedTo || NONE}
          onChange={(v) => set("poseAssignedTo")(v === NONE ? "" : v)}
          options={[
            { value: NONE, label: "Non assigné" },
            ...profiles.map((p) => ({ value: p.id, label: p.nom ?? p.email })),
          ]}
        />
        <FieldText
          label="Date du métré"
          type="date"
          value={form.dateMetre}
          onChange={set("dateMetre")}
        />
        <FieldText label="Fournisseur" value={form.fournisseur} onChange={set("fournisseur")} />
        <FieldText
          label="Réf. commande"
          value={form.refCommande}
          onChange={set("refCommande")}
        />
        <FieldText
          label="Date commande"
          type="date"
          value={form.dateCommande}
          onChange={set("dateCommande")}
        />
        <FieldText
          label="Livraison prévue"
          type="date"
          value={form.dateLivraisonPrevue}
          onChange={set("dateLivraisonPrevue")}
        />
        <FieldText
          label="Livraison réelle"
          type="date"
          value={form.dateLivraisonReelle}
          onChange={set("dateLivraisonReelle")}
        />
        <FieldText
          label="Pose prévue"
          type="date"
          value={form.datePosePrevue}
          onChange={set("datePosePrevue")}
        />
        <FieldText
          label="Pose réalisée"
          type="date"
          value={form.datePoseReelle}
          onChange={set("datePoseReelle")}
        />
        <FieldText
          label="Adresse de pose"
          value={form.adressePose}
          onChange={set("adressePose")}
        />
      </Section>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/leads/${lead.id}`)}
          disabled={pending}
        >
          Annuler
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-eyebrow text-muted-foreground">{title}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </div>
  );
}

function FieldText({
  label,
  value,
  onChange,
  type = "text",
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        step={type === "number" ? "any" : undefined}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select
        items={options}
        value={value}
        onValueChange={(v) => onChange(v ?? "")}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
