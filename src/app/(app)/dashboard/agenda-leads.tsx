import { cn } from "@/lib/utils";

const JOURS_SEM = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

// Calendrier du mois : une case par jour, intensité = volume de leads reçus.
export function AgendaLeads({
  year,
  month,
  counts,
  max,
}: {
  year: number;
  month: number; // 0-11
  counts: Map<number, number>;
  max: number;
}) {
  const nbJours = new Date(year, month + 1, 0).getDate();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7; // lundi = 0
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const cells: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: nbJours }, (_, i) => i + 1),
  ];

  return (
    <div>
      <div className="mb-1.5 grid grid-cols-7 gap-1.5 text-center text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
        {JOURS_SEM.map((j) => (
          <div key={j}>{j}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((d, i) => {
          if (d === null) return <div key={`e${i}`} />;
          const c = counts.get(d) ?? 0;
          const alpha = c === 0 ? 0 : 0.18 + 0.72 * (c / max);
          const white = alpha > 0.5;
          return (
            <div
              key={d}
              className="relative flex aspect-square flex-col items-center justify-center rounded-lg border border-border/60 text-sm"
              style={c ? { backgroundColor: `rgba(47,107,79,${alpha})` } : undefined}
            >
              <span
                className={cn(
                  "absolute left-1 top-0.5 text-[0.6rem] tabular-nums",
                  white ? "text-white/80" : "text-muted-foreground",
                )}
              >
                {d}
              </span>
              {c > 0 ? (
                <span
                  className={cn(
                    "text-base font-bold tabular-nums",
                    white ? "text-white" : "text-foreground",
                  )}
                >
                  {c}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {total === 0
          ? "Aucun lead reçu ce mois."
          : `${total} lead${total > 1 ? "s" : ""} ce mois · jour le plus chargé : ${max}`}
      </p>
    </div>
  );
}
