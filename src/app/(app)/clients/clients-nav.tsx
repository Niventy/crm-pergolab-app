"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/clients", label: "Commande", key: "commande", exact: true },
  { href: "/clients/facturation", label: "Facturation", key: "facturation", exact: false },
  { href: "/clients/sav", label: "SAV", key: "sav", exact: false },
] as const;

export function ClientsNav({
  counts,
}: {
  counts?: Record<string, number>;
}) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border-b border-border px-6">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        const n = counts?.[t.key];
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "relative flex items-center gap-1.5 px-3 py-2 text-sm font-semibold transition-colors",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {n != null ? (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] font-bold",
                  active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {n}
              </span>
            ) : null}
            {active ? (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
