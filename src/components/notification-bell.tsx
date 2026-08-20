"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, AtSign, UserCheck, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { tempsRelatif } from "@/lib/format";
import {
  markNotificationRead,
  markAllNotificationsRead,
  type NotifItem,
} from "@/app/(app)/notifications-actions";

function Icone({ type }: { type: string }) {
  if (type === "mention") return <AtSign className="size-3.5 text-violet-600" />;
  if (type === "attribution")
    return <UserCheck className="size-3.5 text-primary" />;
  return <Bell className="size-3.5 text-muted-foreground" />;
}

export function NotificationBell({
  initial,
}: {
  initial: { items: NotifItem[]; unread: number };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotifItem[]>(initial.items);
  const [unread, setUnread] = useState(initial.unread);

  function lire(n: NotifItem) {
    if (!n.lu) {
      setItems((x) => x.map((i) => (i.id === n.id ? { ...i, lu: true } : i)));
      setUnread((u) => Math.max(0, u - 1));
      markNotificationRead(n.id);
    }
    if (n.leadId) {
      setOpen(false);
      router.push(`/leads/${n.leadId}`);
    }
  }

  function toutLire() {
    setItems((x) => x.map((i) => ({ ...i, lu: true })));
    setUnread(0);
    markAllNotificationsRead();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "relative flex size-8 items-center justify-center rounded-full transition-colors",
          open ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
        aria-label="Notifications"
      >
        <Bell className="size-4" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 top-full z-50 mt-1 w-80 overflow-hidden rounded-xl border border-border bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-sm font-semibold text-foreground">
                Notifications
              </span>
              {unread > 0 ? (
                <button
                  type="button"
                  onClick={toutLire}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <CheckCheck className="size-3.5" /> Tout marquer lu
                </button>
              ) : null}
            </div>

            {items.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                Aucune notification.
              </p>
            ) : (
              <ul className="max-h-96 divide-y divide-border overflow-y-auto">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => lire(n)}
                      className={cn(
                        "flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-muted",
                        !n.lu && "bg-primary/[0.04]",
                      )}
                    >
                      <span className="mt-0.5">
                        <Icone type={n.type} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block text-sm leading-snug",
                            n.lu ? "text-muted-foreground" : "font-medium text-foreground",
                          )}
                        >
                          {n.message}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {tempsRelatif(n.createdAt)}
                        </span>
                      </span>
                      {!n.lu ? (
                        <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
