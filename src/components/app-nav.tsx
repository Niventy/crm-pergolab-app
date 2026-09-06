"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { initiales } from "@/lib/format";
import { logout } from "@/app/login/actions";
import { NotificationBell } from "@/components/notification-bell";
import type { NotifItem } from "@/app/(app)/notifications-actions";

type Item = { href: string; label: string; exact?: boolean; match?: string };

// Navigation À PLAT : les écrans du quotidien en 1 clic (Kanban en premier),
// les écrans secondaires dans « Plus ». Avant : 4 menus déroulants qui cachaient
// 12 pages et mettaient le Kanban à 2 clics.
function buildNav(admin: boolean): { principaux: Item[]; plus: Item[] } {
  return {
    principaux: [
      { href: "/kanban", label: "Kanban" },
      { href: "/liste", label: "Liste" },
      { href: "/clients", label: "Clients" },
      { href: "/devis", label: "Devis" },
      { href: "/emploi-du-temps", label: "Planning" },
      { href: "/dashboard", label: "Dashboard" },
    ],
    plus: [
      { href: "/commentaires", label: "Commentaires" },
      { href: "/commercial", label: "Commercial" },
      ...(admin ? [{ href: "/comptabilite", label: "Comptabilité" }] : []),
      ...(admin
        ? [{ href: "/reglages/sur-mesure", label: "Réglages", match: "/reglages" }]
        : []),
    ],
  };
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
  const { principaux, plus } = buildNav(admin);
  const [plusOpen, setPlusOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const itemActive = (it: Item) => {
    if (it.exact) return pathname === it.href;
    const base = it.match ?? it.href;
    return pathname === base || pathname.startsWith(base + "/");
  };
  const plusActive = plus.some(itemActive);

  // Fermer les menus à la navigation (motif « ajuster l'état pendant le rendu »)
  // et sur Échap.
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setPlusOpen(false);
    setMobileOpen(false);
  }
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setPlusOpen(false);
        setMobileOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const lien = (it: Item, mobile = false) => (
    <Link
      key={it.href}
      href={it.href}
      className={cn(
        mobile
          ? "block rounded-md px-3 py-2 text-sm font-semibold"
          : "relative rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors",
        itemActive(it)
          ? mobile
            ? "bg-primary/10 text-primary"
            : "text-primary"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {it.label}
      {!mobile && itemActive(it) ? (
        <span className="absolute inset-x-2 -bottom-[11px] h-0.5 rounded-full bg-brand" />
      ) : null}
    </Link>
  );

  return (
    <header className="relative flex items-center justify-between border-b bg-white px-4 py-2.5 sm:px-6">
      <div className="flex min-w-0 items-center gap-4 lg:gap-6">
        {/* Menu mobile */}
        <button
          type="button"
          onClick={() => setMobileOpen((o) => !o)}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
          aria-label="Menu"
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>

        <Link href="/kanban" className="flex shrink-0 items-center gap-2">
          <span className="text-display text-lg leading-none text-primary">
            PERGOLAB
          </span>
          <span className="rounded bg-brand px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-brand-foreground">
            CRM
          </span>
        </Link>

        {/* Desktop : à plat */}
        <nav className="hidden items-center gap-1 lg:flex">
          {principaux.map((it) => lien(it))}
          {plus.length ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setPlusOpen((o) => !o)}
                className={cn(
                  "relative flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors",
                  plusActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  plusOpen && "bg-muted",
                )}
                aria-expanded={plusOpen}
              >
                {plusActive ? plus.find(itemActive)?.label : "Plus"}
                <ChevronDown className={cn("size-3 transition-transform", plusOpen && "rotate-180")} />
                {plusActive ? (
                  <span className="absolute inset-x-2 -bottom-[11px] h-0.5 rounded-full bg-brand" />
                ) : null}
              </button>
              {plusOpen ? (
                <div className="absolute left-0 top-full z-50 mt-1 min-w-44 rounded-lg border border-border bg-white p-1 shadow-lg">
                  {plus.map((it) => (
                    <Link
                      key={it.href}
                      href={it.href}
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
          ) : null}
        </nav>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <NotificationBell initial={notifs} />
        <span
          className={cn(
            "hidden rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide sm:inline",
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
        <form action={logout} className="hidden sm:block">
          <Button type="submit" variant="outline" size="sm">
            Déconnexion
          </Button>
        </form>
      </div>

      {/* Panneau mobile */}
      {mobileOpen ? (
        <div className="absolute inset-x-0 top-full z-50 border-b border-border bg-white p-3 shadow-lg lg:hidden">
          <nav className="grid grid-cols-2 gap-1">
            {[...principaux, ...plus].map((it) => lien(it, true))}
          </nav>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
            <span>
              {email} · {admin ? "Admin" : "ADV"}
            </span>
            <form action={logout}>
              <Button type="submit" variant="outline" size="sm">
                Déconnexion
              </Button>
            </form>
          </div>
        </div>
      ) : null}

      {/* Overlay de fermeture au clic extérieur */}
      {plusOpen || mobileOpen ? (
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          onClick={() => {
            setPlusOpen(false);
            setMobileOpen(false);
          }}
          className="fixed inset-0 z-40 cursor-default"
        />
      ) : null}
    </header>
  );
}
