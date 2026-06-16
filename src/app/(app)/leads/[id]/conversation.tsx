"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { initiales } from "@/lib/format";
import { addMessage } from "./actions";

type Profil = { id: string; nom: string | null; email: string };
type Message = {
  id: string;
  contenu: string;
  createdAt: Date | string;
  auteur: { nom: string | null; email: string } | null;
};

// Identifiant court d'un profil (1er mot du nom) pour les @mentions.
function handleOf(p: Profil): string {
  return (p.nom ?? p.email).trim().split(/[\s(]/)[0];
}

const MENTION_END = /@([\p{L}\p{N}._-]*)$/u;
const MENTION_ALL = /(@[\p{L}\p{N}._-]+)/gu;

export function Conversation({
  leadId,
  profiles,
  messages,
  currentUserId,
}: {
  leadId: string;
  profiles: Profil[];
  messages: Message[];
  currentUserId?: string | null;
}) {
  const [text, setText] = useState("");
  const [query, setQuery] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);

  const notifiables = profiles.filter((p) => p.id !== currentUserId);

  // Insère une @mention prête à notifier (pilule « Notifier … »).
  function notifier(p: Profil) {
    const token = `@${handleOf(p)} `;
    setText((t) => (t === "" || t.endsWith(" ") ? t : t + " ") + token);
    requestAnimationFrame(() => ref.current?.focus());
  }

  const handleSet = useMemo(
    () => new Set(profiles.map((p) => handleOf(p).toLowerCase())),
    [profiles],
  );

  const suggestions = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    return profiles
      .filter((p) => {
        const h = handleOf(p).toLowerCase();
        const n = (p.nom ?? p.email).toLowerCase();
        return h.startsWith(q) || n.includes(q);
      })
      .slice(0, 6);
  }, [query, profiles]);

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setText(val);
    const caret = e.target.selectionStart ?? val.length;
    const m = val.slice(0, caret).match(MENTION_END);
    setQuery(m ? m[1] : null);
  }

  function pick(p: Profil) {
    const el = ref.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(MENTION_END, `@${handleOf(p)} `);
    const next = before + text.slice(caret);
    setText(next);
    setQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (query !== null && suggestions.length > 0) {
      if (e.key === "Enter") {
        e.preventDefault();
        pick(suggestions[0]);
      } else if (e.key === "Escape") {
        setQuery(null);
      }
    }
  }

  function resolveMentions(t: string): string[] {
    const ids = new Set<string>();
    for (const m of t.matchAll(MENTION_ALL)) {
      const h = m[1].slice(1).toLowerCase();
      const p = profiles.find((pr) => handleOf(pr).toLowerCase() === h);
      if (p) ids.add(p.id);
    }
    return [...ids];
  }

  function submit() {
    const t = text.trim();
    if (!t) return;
    start(async () => {
      const res = await addMessage(leadId, t, resolveMentions(t));
      if (res.ok) {
        setText("");
        setQuery(null);
      } else {
        toast.error(res.error ?? "Échec de l'envoi");
      }
    });
  }

  return (
    <div className="space-y-4">
      {notifiables.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Notifier&nbsp;:</span>
          {notifiables.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => notifier(p)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                {initiales(p.nom ?? p.email)}
              </span>
              {(p.nom ?? p.email).split(/[\s(]/)[0]}
            </button>
          ))}
        </div>
      ) : null}
      <div className="relative">
        <Textarea
          ref={ref}
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder="Écrire un message…  tape @ pour mentionner un collègue"
          rows={3}
        />
        {query !== null && suggestions.length > 0 ? (
          <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
            {suggestions.map((p) => (
              <button
                key={p.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(p);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <span className="flex size-6 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {initiales(p.nom ?? p.email)}
                </span>
                <span className="font-medium text-foreground">{p.nom ?? p.email}</span>
                <span className="text-xs text-muted-foreground">@{handleOf(p)}</span>
              </button>
            ))}
          </div>
        ) : null}
        <div className="mt-2 flex justify-end">
          <Button type="button" size="sm" onClick={submit} disabled={pending || !text.trim()}>
            {pending ? "Envoi…" : "Envoyer"}
          </Button>
        </div>
      </div>

      {messages.length > 0 ? (
        <>
          <Separator />
          <ul className="space-y-3">
            {messages.map((msg) => (
              <li key={msg.id} className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  {initiales(msg.auteur?.nom ?? msg.auteur?.email ?? "?")}
                </span>
                <div className="space-y-0.5">
                  <div className="text-xs text-muted-foreground">
                    {msg.auteur?.nom ?? msg.auteur?.email ?? "Inconnu"} ·{" "}
                    {new Date(msg.createdAt).toLocaleString("fr-FR", {
                      dateStyle: "short",
                      timeStyle: "short",
                      timeZone: "Europe/Paris",
                    })}
                  </div>
                  <div className="whitespace-pre-wrap text-sm text-foreground">
                    {renderWithMentions(msg.contenu, handleSet)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Aucun message. Démarre la conversation — mentionne un collègue avec{" "}
          <span className="font-medium text-primary">@</span>.
        </p>
      )}
    </div>
  );
}

function renderWithMentions(text: string, handleSet: Set<string>) {
  return text.split(MENTION_ALL).map((part, i) => {
    if (part.startsWith("@") && handleSet.has(part.slice(1).toLowerCase())) {
      return (
        <span key={i} className="rounded bg-primary/10 px-1 font-medium text-primary">
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
