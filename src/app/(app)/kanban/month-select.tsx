"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Sélecteur de mois (réception du lead) pour la vue Kanban.
export function MonthSelect({
  value,
  options,
}: {
  value: string;
  options: { value: string; label: string }[];
}) {
  const router = useRouter();

  function onChange(v: string | null) {
    const m = v ?? "tous";
    router.push(m === "tous" ? "/kanban" : `/kanban?mois=${m}`);
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
