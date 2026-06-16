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
  { href: "/emploi-du-temps", label: "Planning" },
];

export function AppNav({ email }: { email: string | null }) {
  const pathname = usePathname();

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
        <nav className="flex items-center gap-0.5">
          {TABS.map((tab) => {
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
