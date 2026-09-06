"use client";

import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchLeadEmails, type ThreadMessage } from "./email-actions";

export function EmailThread({ leadEmail }: { leadEmail: string }) {
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      // « Actualiser » (tick > 0) force la relecture ; sinon cache court serveur.
      const res = await fetchLeadEmails(leadEmail, tick > 0);
      if (!active) return;
      setMessages(res.messages ?? []);
      setError(res.ok ? null : (res.error ?? "Erreur"));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [leadEmail, tick]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          Conversation Gmail avec {leadEmail}
        </span>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            setTick((t) => t + 1);
          }}
          disabled={loading}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <RotateCw className={cn("size-3.5", loading && "animate-spin")} />
          Actualiser
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement des emails…</p>
      ) : error ? (
        <p className="text-sm text-amber-700">{error}</p>
      ) : messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun email échangé avec ce contact.
        </p>
      ) : (
        <ul className="space-y-2">
          {messages.map((m) => {
            const open = openId === m.id;
            const incoming = m.direction === "in";
            return (
              <li key={m.id} className="overflow-hidden rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : m.id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
                >
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                      incoming
                        ? "bg-blue-100 text-blue-700"
                        : "bg-green-100 text-green-700",
                    )}
                  >
                    {incoming ? (
                      <ArrowDownLeft className="size-3" />
                    ) : (
                      <ArrowUpRight className="size-3" />
                    )}
                    {incoming ? "Reçu" : "Envoyé"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {m.subject || "(sans objet)"}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {m.date
                      ? new Date(m.date).toLocaleString("fr-FR", {
                          dateStyle: "short",
                          timeStyle: "short",
                          timeZone: "Europe/Paris",
                        })
                      : ""}
                  </span>
                </button>
                {open ? (
                  <div className="border-t border-border bg-muted/20 px-3 py-2 text-sm">
                    <div className="mb-1 text-xs text-muted-foreground">
                      {m.from}
                      {m.account ? (
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5">
                          boîte : {m.account}
                        </span>
                      ) : null}
                    </div>
                    <div className="max-h-72 overflow-auto whitespace-pre-wrap text-foreground">
                      {m.body || "(vide)"}
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
