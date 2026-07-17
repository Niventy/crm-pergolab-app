"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { initiales } from "@/lib/format";
import { logout } from "@/app/login/actions";

const TABS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/kanban", label: "Kanban" },
  { href: "/liste", label: "Liste" },
  { href: "/devis", label: "Devis" },
  { href: "/emploi-du-temps", label: "Planning" },
  { href: "/commercial", label: "Commercial" },
  // Comptabilité : admin uniquement (ajouté plus bas selon le rôle).
];

export function AppNav({
  email,
  role,
}: {
  email: string | null;
  role?: string;
}) {
  const pathname = usePathname();
  const admin = role === "admin";
  const tabs = admin
    ? [...TABS, { href: "/comptabilite", label: "Comptabilité" }]
    : TABS;

  return (
    <header className="flex items-center justify-between border-b bg-white px-6 py-2.5">
      <div className="flex items-center gap-7">
        <Link href="/kanban" className="flex items-center gap-2">
          <span className="text-display text-lg leading-none text-primary">
            PERGOLAB
          </span>
          <span className="rounded bg-brand px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-brand-foreground">
            CRM
          </span>
        </Link>
        <nav className="flex flex-wrap items-center gap-0.5">
          {tabs.map((tab) => {
            const active = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "relative px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
                {active ? (
                  <span className="absolute inset-x-2 -bottom-[11px] h-0.5 rounded-full bg-brand" />
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-3">
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
    </header>
  );
}
