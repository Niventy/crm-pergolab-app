"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { initiales } from "@/lib/format";
import { logout } from "@/app/login/actions";
import { NotificationBell } from "@/components/notification-bell";
import type { NotifItem } from "@/app/(app)/notifications-actions";

type Item = { href: string; label: string; exact?: boolean; match?: string };
type Univers = { label: string; items: Item[] };

// Navigation regroupée en 4 univers métier (au lieu d'une liste plate).
function buildUnivers(admin: boolean): Univers[] {
  return [
    {
      label: "Vente",
      items: [
        { href: "/kanban", label: "Kanban" },
        { href: "/liste", label: "Liste" },
        { href: "/devis", label: "Devis" },
      ],
    },
    {
      label: "Clients",
      items: [
        { href: "/clients", label: "Portefeuille", exact: true },
        { href: "/clients/chantiers", label: "Chantiers" },
      ],
    },
    {
      label: "Pilotage",
      items: [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/commercial", label: "Commercial" },
        ...(admin ? [{ href: "/comptabilite", label: "Comptabilité" }] : []),
      ],
    },
    {
      label: "Mon espace",
      items: [
        { href: "/emploi-du-temps", label: "Planning" },
        ...(admin
          ? [{ href: "/reglages/sur-mesure", label: "Réglages", match: "/reglages" }]
          : []),
      ],
    },
  ];
}

export function AppNav({
  email,
  role,
  notifs,
}: {
  email: string | null;
  role?: string;
  notifs: { items: NotifItem[]; unread: number };
}) {
  const pathname = usePathname();
  const admin = role === "admin";
  const univers = buildUnivers(admin);
  const [open, setOpen] = useState<string | null>(null);

  const itemActive = (it: Item) => {
    if (it.exact) return pathname === it.href;
    const base = it.match ?? it.href;
    return pathname === base || pathname.startsWith(base + "/");
  };
  const universActive = (u: Univers) => u.items.some(itemActive);
  const activeItemLabel = (u: Univers) => u.items.find(itemActive)?.label;

  return (
    <header className="relative flex items-center justify-between border-b bg-white px-6 py-2.5">
      <div className="flex items-center gap-6">
        <Link href="/kanban" className="flex items-center gap-2">
          <span className="text-display text-lg leading-none text-primary">
            PERGOLAB
          </span>
          <span className="rounded bg-brand px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-brand-foreground">
            CRM
          </span>
        </Link>

        <nav className="flex flex-wrap items-center gap-1">
          {univers.map((u) => {
            const active = universActive(u);
            const isOpen = open === u.label;
            const sousPage = active ? activeItemLabel(u) : null;
            return (
              <div key={u.label} className="relative">
                <button
                  type="button"
                  onClick={() => setOpen((o) => (o === u.label ? null : u.label))}
                  className={cn(
                    "relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors",
                    active
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                    isOpen && "bg-muted",
                  )}
                >
                  {u.label}
                  {sousPage ? (
                    <span className="hidden text-[10px] font-medium normal-case text-muted-foreground sm:inline">
                      · {sousPage}
                    </span>
                  ) : null}
                  <ChevronDown
                    className={cn(
                      "size-3 transition-transform",
                      isOpen && "rotate-180",
                    )}
                  />
                  {active ? (
                    <span className="absolute inset-x-2 -bottom-[11px] h-0.5 rounded-full bg-brand" />
                  ) : null}
                </button>

                {isOpen ? (
                  <div className="absolute left-0 top-full z-50 mt-1 min-w-44 rounded-lg border border-border bg-white p-1 shadow-lg">
                    {u.items.map((it) => (
                      <Link
                        key={it.href}
                        href={it.href}
                        onClick={() => setOpen(null)}
                        className={cn(
                          "block rounded-md px-3 py-1.5 text-sm transition-colors",
                          itemActive(it)
                            ? "bg-primary/10 font-semibold text-primary"
                            : "text-foreground hover:bg-muted",
                        )}
                      >
                        {it.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <NotificationBell initial={notifs} />
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            admin
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground",
          )}
          title={
            admin
              ? "Admin — accès aux marges, coûts et comptabilité"
              : "ADV — accès commercial"
          }
        >
          {admin ? "Admin" : "ADV"}
        </span>
        <span
          className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary"
          title={email ?? undefined}
        >
          {initiales(email?.split("@")[0])}
        </span>
        <form action={logout}>
          <Button type="submit" variant="outline" size="sm">
            Déconnexion
          </Button>
        </form>
      </div>

      {/* Overlay de fermeture au clic extérieur */}
      {open ? (
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          onClick={() => setOpen(null)}
          className="fixed inset-0 z-40 cursor-default"
        />
      ) : null}
    </header>
  );
}
