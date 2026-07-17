"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Sélecteur de période (mois de réception). Conserve le paramètre `adv`
// et reste sur la page courante (dashboard, commercial, comptabilité…).
export function PeriodSelect({
  value,
  options,
  basePath = "/dashboard",
}: {
  value: string;
  options: { value: string; label: string }[];
  basePath?: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function onChange(v: string | null) {
    const p = new URLSearchParams(sp.toString());
    if (!v || v === "annee") p.delete("mois");
    else p.set("mois", v);
    const qs = p.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  return (
    <Select items={options} value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-44">
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
  );
}
