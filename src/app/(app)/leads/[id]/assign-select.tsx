"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { initiales } from "@/lib/format";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { assignLead } from "./actions";

type Profil = { id: string; nom: string | null; email: string };

export function AssignSelect({
  leadId,
  profiles,
  assignedTo,
  currentUserId,
}: {
  leadId: string;
  profiles: Profil[];
  assignedTo: string | null;
  currentUserId?: string | null;
}) {
  const [pending, start] = useTransition();
  const current = profiles.find((p) => p.id === assignedTo) ?? null;
  const nom = current?.nom ?? current?.email ?? null;

  function onChange(v: string | null) {
    start(async () => {
      try {
        await assignLead(leadId, !v || v === "none" ? null : v);
        toast.success("Attribution mise à jour");
      } catch {
        toast.error("Échec de l'attribution");
      }
    });
  }

  return (
    <Select value={assignedTo ?? "none"} onValueChange={onChange} disabled={pending}>
      <SelectTrigger
        className={cn(
          "h-7 w-auto gap-1.5 rounded-full border-0 px-2.5 text-xs font-semibold",
          nom ? "bg-primary/10 text-primary" : "bg-amber-100 text-amber-700",
        )}
      >
        {nom ? (
          <span className="flex items-center gap-1.5">
            <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
              {initiales(nom)}
            </span>
            {nom}
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-amber-500" />
            Non assigné
          </span>
        )}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Non assigné</SelectItem>
        {profiles.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {(p.nom ?? p.email) + (p.id === currentUserId ? " (moi)" : "")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
