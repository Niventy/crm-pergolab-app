"use client";

import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Briques partagées des tableaux (Liste, Clients) — évite les copies divergentes.

export function FilterSelect({
  options,
  value,
  onChange,
  width,
  fallback = "all",
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  width: string;
  fallback?: string;
}) {
  return (
    <Select items={options} value={value} onValueChange={(v) => onChange(v ?? fallback)}>
      <SelectTrigger className={cn("h-8", width)}>
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

export function Td({
  children,
  className,
  colSpan,
  title,
}: {
  children?: React.ReactNode;
  className?: string;
  colSpan?: number;
  title?: string;
}) {
  return (
    <td
      colSpan={colSpan}
      title={title}
      className={cn(
        "border-b border-r border-border px-3 py-2 align-middle last:border-r-0",
        className,
      )}
    >
      {children}
    </td>
  );
}
