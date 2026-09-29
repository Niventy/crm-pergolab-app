"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Pages de réglages ouvertes à toute l'équipe : le devis (descriptions, options,
// produits) et la liste des poseurs proposée sur les fiches client.
const SOUS_ONGLETS = [
  { href: "/reglages/sur-mesure", label: "Descriptions du devis" },
  { href: "/reglages/options", label: "Options du configurateur" },
  { href: "/reglages/produits", label: "Produits & forfaits" },
  { href: "/reglages/poseurs", label: "Poseurs" },
];

export function ReglagesNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border-b border-border">
      {SOUS_ONGLETS.map((o) => {
        const active = pathname.startsWith(o.href);
        return (
          <Link
            key={o.href}
            href={o.href}
            className={cn(
              "relative px-3 py-2 text-sm font-semibold transition-colors",
              active
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
            {active ? (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
