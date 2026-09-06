"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KanbanSquare, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Deux VUES du même espace (Kanban par étape de chantier / Tableau), plus des
// onglets par état d'encaissement : ce dernier est un badge + un filtre.
const TABS = [
  { href: "/clients", label: "Kanban", Icon: KanbanSquare, exact: true },
  { href: "/clients/tableau", label: "Tableau", Icon: Table2, exact: false },
] as const;

export function ClientsNav({ total }: { total?: number }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap items-center gap-1 border-b border-border px-6">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "relative flex items-center gap-1.5 px-3 py-2 text-sm font-semibold transition-colors",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <t.Icon className="size-4" />
            {t.label}
            {active ? (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />
            ) : null}
          </Link>
        );
      })}
      {total != null ? (
        <span className="ml-auto text-xs text-muted-foreground">
          {total} client{total > 1 ? "s" : ""}
        </span>
      ) : null}
    </nav>
  );
}
