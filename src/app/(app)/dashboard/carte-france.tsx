"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { FRANCE_VIEWBOX, FRANCE_REGIONS } from "./france-geo";

// Carte de France métropolitaine colorée par nombre de leads / région.
// Source du tracé : regisenguehard/carte-france-svg (CC BY 4.0).
export function CarteFrance({
  counts,
  horsMetropole = 0,
}: {
  counts: Record<string, number>;
  horsMetropole?: number;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...Object.values(counts));

  const fillFor = (code: string) => {
    const c = counts[code] ?? 0;
    if (c === 0) return "rgba(47,107,79,0.05)";
    return `rgba(47,107,79,${(0.2 + 0.7 * (c / max)).toFixed(2)})`;
  };

  const classees = [...FRANCE_REGIONS]
    .map((r) => ({ ...r, c: counts[r.code] ?? 0 }))
    .sort((a, b) => b.c - a.c);

  const survol = FRANCE_REGIONS.find((r) => r.code === hover);
  const survolCount = hover ? (counts[hover] ?? 0) : 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <div className="mb-1 h-5 text-sm">
          {survol ? (
            <span className="font-medium text-foreground">
              {survol.nom} ·{" "}
              <span className="tabular-nums">{survolCount}</span> lead
              {survolCount > 1 ? "s" : ""}
            </span>
          ) : (
            <span className="text-muted-foreground">Survolez une région</span>
          )}
        </div>
        <svg
          viewBox={FRANCE_VIEWBOX}
          className="h-auto w-full"
          role="img"
          aria-label="Carte des leads reçus par région"
        >
          {FRANCE_REGIONS.map((r) => {
            const actif = hover === r.code;
            return (
              <g
                key={r.code}
                fill={fillFor(r.code)}
                stroke={actif ? "#2f6b4f" : "#ffffff"}
                strokeWidth={actif ? 1.4 : 0.6}
                onMouseEnter={() => setHover(r.code)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: "default", transition: "fill 0.12s" }}
              >
                {r.paths.map((d, i) => (
                  <path key={i} d={d} />
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      <div>
        <ul className="space-y-0.5">
          {classees.map((r) => (
            <li
              key={r.code}
              onMouseEnter={() => setHover(r.code)}
              onMouseLeave={() => setHover(null)}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors",
                hover === r.code ? "bg-muted" : "",
              )}
            >
              <span
                className="size-3 shrink-0 rounded-sm border border-border"
                style={{ backgroundColor: fillFor(r.code) }}
              />
              <span className="flex-1 truncate text-foreground">{r.nom}</span>
              <span className="tabular-nums text-muted-foreground">{r.c}</span>
            </li>
          ))}
          {horsMetropole > 0 ? (
            <li className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground">
              <span className="size-3 shrink-0 rounded-sm border border-dashed border-border" />
              <span className="flex-1 truncate">Hors métropole / sans CP</span>
              <span className="tabular-nums">{horsMetropole}</span>
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
