"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Pencil } from "lucide-react";
import { toast } from "sonner";
import { formatHorodatage } from "@/lib/format";
import { mm, type Metre } from "@/lib/chantier-validation";
import { enregistrerMetre } from "./validation-actions";

const INPUT =
  "w-full rounded-md border border-border bg-white px-2.5 py-1.5 text-sm outline-none focus:border-primary";

// Métré STRUCTURÉ (ce que le client validera dans son espace). Pré-rempli
// depuis le devis signé ; les écarts avec le devis sont signalés à l'équipe.
export function MetreForm({
  leadId,
  metre,
  prerempli,
  ecarts,
  ancienTexte,
}: {
  leadId: string;
  metre: Metre | null;
  prerempli: Metre;
  ecarts: string[];
  ancienTexte: string | null; // ancien champ libre « Métré (mesure / kilo) »
}) {
  const router = useRouter();
  const [edition, setEdition] = useState(!metre);
  const [pending, start] = useTransition();
  const base = metre ?? prerempli;
  const [f, setF] = useState({
    largeurMm: base.largeurMm?.toString() ?? "",
    avanceeMm: base.avanceeMm?.toString() ?? "",
    hauteurMm: base.hauteurMm?.toString() ?? "",
    pose: base.pose ?? "",
    remarques: base.remarques ?? "",
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((x) => ({ ...x, [k]: e.target.value }));

  function enregistrer() {
    start(async () => {
      const r = await enregistrerMetre(leadId, {
        largeurMm: Number(f.largeurMm) || null,
        avanceeMm: Number(f.avanceeMm) || null,
        hauteurMm: Number(f.hauteurMm) || null,
        pose: f.pose === "adossee" || f.pose === "autoportee" ? f.pose : null,
        remarques: f.remarques,
      });
      if (!r.ok) return void toast.error(r.error ?? "Échec");
      toast.success("Métré enregistré");
      setEdition(false);
      router.refresh();
    });
  }

  if (!edition && metre) {
    return (
      <div className="space-y-2 text-sm">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
          <Val label="Largeur" v={mm(metre.largeurMm)} />
          <Val label="Avancée" v={mm(metre.avanceeMm)} />
          <Val label="Hauteur" v={metre.hauteurMm ? mm(metre.hauteurMm) : "—"} />
          <Val label="Pose" v={metre.pose === "adossee" ? "Adossée" : "Autoportée"} />
        </div>
        {metre.remarques ? (
          <p className="whitespace-pre-line rounded-md bg-muted/50 px-2.5 py-1.5 text-xs">{metre.remarques}</p>
        ) : null}
        <Ecarts ecarts={ecarts} />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Saisi{metre.saisiPar ? ` par ${metre.saisiPar}` : ""}
            {metre.saisiAt ? ` le ${formatHorodatage(metre.saisiAt)}` : ""}
          </span>
          <button
            type="button"
            onClick={() => setEdition(true)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/5"
          >
            <Pencil className="size-3.5" /> Modifier
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {!metre ? (
        <p className="text-xs text-muted-foreground">
          Pré-rempli depuis le devis signé : corrige avec les mesures relevées sur place.
          {ancienTexte ? ` (Ancienne saisie : « ${ancienTexte} »)` : ""}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="text-xs text-muted-foreground">
          Largeur (mm)
          <input inputMode="numeric" className={INPUT} value={f.largeurMm} onChange={set("largeurMm")} />
        </label>
        <label className="text-xs text-muted-foreground">
          Avancée (mm)
          <input inputMode="numeric" className={INPUT} value={f.avanceeMm} onChange={set("avanceeMm")} />
        </label>
        <label className="text-xs text-muted-foreground">
          Hauteur (mm)
          <input inputMode="numeric" className={INPUT} value={f.hauteurMm} onChange={set("hauteurMm")} placeholder="facultatif" />
        </label>
        <label className="text-xs text-muted-foreground">
          Pose
          <select className={INPUT} value={f.pose} onChange={set("pose")}>
            <option value="">—</option>
            <option value="adossee">Adossée</option>
            <option value="autoportee">Autoportée</option>
          </select>
        </label>
      </div>
      <label className="block text-xs text-muted-foreground">
        Remarques (montrées au client)
        <textarea
          rows={2}
          className={INPUT + " resize-none"}
          value={f.remarques}
          onChange={set("remarques")}
          placeholder="ex. fixation sur façade crépie, évacuation côté gauche…"
        />
      </label>
      <div className="flex justify-end gap-2">
        {metre ? (
          <button
            type="button"
            onClick={() => setEdition(false)}
            disabled={pending}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          >
            Annuler
          </button>
        ) : null}
        <button
          type="button"
          onClick={enregistrer}
          disabled={pending}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Enregistrer le métré
        </button>
      </div>
    </div>
  );
}

function Val({ label, v }: { label: string; v: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{v}</div>
    </div>
  );
}

function Ecarts({ ecarts }: { ecarts: string[] }) {
  if (!ecarts.length) return null;
  return (
    <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <div>
        <span className="font-semibold">Écart avec le devis signé :</span> {ecarts.join(" · ")}
      </div>
    </div>
  );
}
