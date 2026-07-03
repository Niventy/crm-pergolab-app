"use client";

import { useEffect, useState } from "react";
import { RefreshCw, ExternalLink, MapPin } from "lucide-react";
import type { UpcomingEvent } from "@/lib/google-calendar";
import { fetchAgenda } from "./actions";

function fmt(start: string, allDay: boolean): string {
  if (!start) return "";
  const d = new Date(start.length === 10 ? `${start}T00:00:00` : start);
  if (Number.isNaN(d.getTime())) return start;
  return d.toLocaleString(
    "fr-FR",
    allDay
      ? { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" }
      : {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Paris",
        },
  );
}

export function AgendaGoogle() {
  const [events, setEvents] = useState<UpcomingEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchAgenda().then((r) => {
      if (!alive) return;
      if (r.ok) {
        setEvents(r.events ?? []);
        setError(null);
      } else {
        setEvents([]);
        setError(r.error ?? "Erreur");
      }
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [tick]);

  function refresh() {
    setLoading(true);
    setError(null);
    setTick((t) => t + 1);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-eyebrow text-muted-foreground">Mon agenda Google</span>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          Actualiser
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : error === "scope" ? (
        <p className="text-sm text-amber-700">
          Agenda non autorisé — régénère les tokens Google avec le scope{" "}
          <code>calendar.events</code>.
        </p>
      ) : error ? (
        <p className="text-sm text-muted-foreground">{error}</p>
      ) : events && events.length > 0 ? (
        <ul className="divide-y divide-border">
          {events.map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="w-32 shrink-0 capitalize tabular-nums text-muted-foreground">
                {fmt(e.start, e.allDay)}
              </span>
              <span className="flex-1 truncate text-foreground">{e.summary}</span>
              {e.location ? (
                <span className="hidden items-center gap-1 truncate text-xs text-muted-foreground sm:flex">
                  <MapPin className="size-3" />
                  {e.location}
                </span>
              ) : null}
              {e.htmlLink ? (
                <a
                  href={e.htmlLink}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-muted-foreground hover:text-primary"
                  aria-label="Ouvrir dans Google Agenda"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Aucun évènement à venir.</p>
      )}
    </div>
  );
}
