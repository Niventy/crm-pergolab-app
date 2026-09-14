"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Check, Archive, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { formatEuros } from "@/lib/format";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  OPTION_TYPES,
  prixOption,
  type OptionSM,
  type OptionType,
} from "@/app/(app)/leads/[id]/devis/[devisId]/sur-mesure";
import {
  addOptionConfigurateur,
  updateOptionConfigurateur,
  setOptionConfigurateurActive,
} from "../actions";

const eur = (n: number) => formatEuros(String(Math.round(n * 100) / 100));

type Draft = {
  label: string;
  type: OptionType;
  prix: string;
  forfait: string;
  defLmm: string;
  defHmm: string;
};

const toDraft = (o: OptionSM): Draft => ({
  label: o.label,
  type: o.type,
  prix: String(o.prix ?? 0),
  forfait: o.forfait != null ? String(o.forfait) : "",
  defLmm: o.defL ? String(Math.round(o.defL * 1000)) : "",
  defHmm: o.defH ? String(Math.round(o.defH * 1000)) : "",
});

const VIDE: Draft = { label: "", type: "surface", prix: "", forfait: "", defLmm: "", defHmm: "" };

export function OptionsConfigurateurClient({ options }: { options: OptionSM[] }) {
  const [showNew, setShowNew] = useState(false);
  const actives = options.filter((o) => o.actif !== false);
  const retirees = options.filter((o) => o.actif === false);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        {showNew ? (
          <OptionCard onClose={() => setShowNew(false)} initial={VIDE} />
        ) : (
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-4" /> Nouvelle option
          </button>
        )}
        {actives.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            Aucune option active : le configurateur n&apos;en proposera aucune.
          </p>
        ) : (
          actives.map((o) => <OptionCard key={o.id} option={o} initial={toDraft(o)} />)
        )}
      </section>

      {retirees.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-eyebrow text-muted-foreground">
            Options retirées ({retirees.length}) — plus proposées, mais les devis qui les
            utilisent se rouvrent normalement
          </h2>
          {retirees.map((o) => (
            <OptionRetiree key={o.id} option={o} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function OptionCard({
  option,
  initial,
  onClose,
}: {
  option?: OptionSM;
  initial: Draft;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [confirmRetrait, setConfirmRetrait] = useState(false);
  const set = (patch: Partial<Draft>) => {
    setD((cur) => ({ ...cur, ...patch }));
    setSaved(false);
  };
  const surfacique = d.type !== "unite";
  const num = (s: string) => Number(String(s).replace(",", ".")) || 0;

  // Exemple de prix avec les dimensions par défaut (ou 1 pièce) pour vérifier le mode.
  const exemple = (() => {
    const o: OptionSM = {
      id: "x",
      label: d.label,
      type: d.type,
      prix: num(d.prix),
      forfait: num(d.forfait),
    };
    const L = num(d.defLmm) / 1000;
    const H = num(d.defHmm) / 1000;
    if (surfacique && !(L > 0 && H > 0)) return null;
    return { p: prixOption(o, { qte: 1, L, H }), L, H };
  })();

  function enregistrer() {
    start(async () => {
      const payload = {
        label: d.label,
        type: d.type,
        prix: num(d.prix),
        forfait: d.type === "surface_forfait" ? num(d.forfait) : null,
        defLmm: surfacique && d.defLmm ? num(d.defLmm) : null,
        defHmm: surfacique && d.defHmm ? num(d.defHmm) : null,
      };
      const r = option
        ? await updateOptionConfigurateur(option.id, payload)
        : await addOptionConfigurateur(payload);
      if (r.ok) {
        setSaved(true);
        toast.success(option ? `« ${d.label} » mise à jour` : `« ${d.label} » ajoutée au configurateur`);
        onClose?.();
        router.refresh();
      } else toast.error(r.error ?? "Échec");
    });
  }

  function retirer() {
    if (!option) return;
    start(async () => {
      const r = await setOptionConfigurateurActive(option.id, false);
      setConfirmRetrait(false);
      if (r.ok) {
        toast.success(`« ${option.label} » retirée du configurateur`);
        router.refresh();
      } else toast.error(r.error ?? "Échec");
    });
  }

  const inputCls =
    "h-9 rounded-md border border-border bg-white px-2 text-sm outline-none focus:border-primary";

  return (
    <div className="space-y-2 rounded-xl border border-border bg-white p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_16rem]">
        <input
          value={d.label}
          onChange={(e) => set({ label: e.target.value })}
          placeholder="Libellé de l'option (ex. Store Motorisé)"
          className={`${inputCls} font-medium`}
        />
        <select
          value={d.type}
          onChange={(e) => set({ type: e.target.value as OptionType })}
          aria-label="Mode de prix"
          className={inputCls}
        >
          {OPTION_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="block">
          <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
            {surfacique ? "Prix HT / m²" : "Prix HT / pièce"}
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={d.prix}
            onChange={(e) => set({ prix: e.target.value })}
            placeholder="0"
            className={`${inputCls} w-full text-right`}
          />
        </label>
        {d.type === "surface_forfait" ? (
          <label className="block">
            <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
              Forfait HT / pièce
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={d.forfait}
              onChange={(e) => set({ forfait: e.target.value })}
              placeholder="0"
              className={`${inputCls} w-full text-right`}
            />
          </label>
        ) : null}
        {surfacique ? (
          <>
            <label className="block">
              <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                Longueur par défaut (mm)
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={d.defLmm}
                onChange={(e) => set({ defLmm: e.target.value })}
                placeholder="ex. 4630"
                className={`${inputCls} w-full text-right`}
              />
            </label>
            <label className="block">
              <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                Hauteur par défaut (mm)
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={d.defHmm}
                onChange={(e) => set({ defHmm: e.target.value })}
                placeholder="ex. 2330"
                className={`${inputCls} w-full text-right`}
              />
            </label>
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {exemple
            ? surfacique
              ? `Exemple : ${Math.round(exemple.L * 1000)} × ${Math.round(exemple.H * 1000)} mm → ${eur(exemple.p)} HT la pièce`
              : `${eur(exemple.p)} HT la pièce`
            : surfacique
              ? "Renseigne des dimensions par défaut pour voir un exemple de prix."
              : ""}
          {option ? <span className="ml-2 opacity-70">· clé {option.id}</span> : null}
        </span>
        <div className="flex items-center gap-2">
          {saved ? (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="size-3.5" /> Enregistré
            </span>
          ) : null}
          {option ? (
            <button
              type="button"
              onClick={() => setConfirmRetrait(true)}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-red-600"
            >
              <Archive className="size-3.5" /> Retirer
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Annuler
            </button>
          )}
          <button
            type="button"
            onClick={enregistrer}
            disabled={pending || !d.label.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {option ? "Enregistrer" : "Ajouter"}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRetrait}
        titre={`Retirer « ${d.label} » du configurateur ?`}
        description="Elle ne sera plus proposée sur les nouveaux devis. Les devis qui l'utilisent déjà ne changent pas et se rouvrent normalement. Tu pourras la réactiver."
        confirmLabel="Retirer"
        danger
        pending={pending}
        onConfirm={retirer}
        onCancel={() => setConfirmRetrait(false)}
      />
    </div>
  );
}

function OptionRetiree({ option }: { option: OptionSM }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const mode = OPTION_TYPES.find((t) => t.id === option.type)?.label ?? option.type;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2 text-sm">
      <span className="font-medium text-foreground">{option.label}</span>
      <span className="text-xs text-muted-foreground">
        {mode} · {eur(option.prix)}
        {option.type === "surface_forfait" ? ` + ${eur(option.forfait ?? 0)}` : ""}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await setOptionConfigurateurActive(option.id, true);
            if (r.ok) {
              toast.success(`« ${option.label} » réactivée`);
              router.refresh();
            } else toast.error(r.error ?? "Échec");
          })
        }
        className="ml-auto inline-flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
        Réactiver
      </button>
    </div>
  );
}
