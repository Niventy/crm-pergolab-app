"use server";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { currentUserId } from "@/lib/current-user";

export type NotifItem = {
  id: string;
  type: string;
  message: string;
  leadId: string | null;
  lu: boolean;
  createdAt: Date;
  acteur: string | null;
};

export async function getMesNotifications(): Promise<{
  items: NotifItem[];
  unread: number;
}> {
  const userId = await currentUserId();
  if (!userId) return { items: [], unread: 0 };

  const [rows, unreadRows] = await Promise.all([
    db.query.notifications.findMany({
      where: eq(notifications.userId, userId),
      with: { acteur: true },
      orderBy: [desc(notifications.createdAt)],
      limit: 20,
    }),
    db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(eq(notifications.userId, userId), eq(notifications.lu, false)),
      ),
  ]);

  return {
    items: rows.map((n) => ({
      id: n.id,
      type: n.type,
      message: n.message,
      leadId: n.leadId,
      lu: n.lu,
      createdAt: n.createdAt,
      acteur: n.acteur?.nom ?? n.acteur?.email ?? null,
    })),
    unread: unreadRows.length,
  };
}

export async function markNotificationRead(id: string) {
  const userId = await currentUserId();
  if (!userId) return;
  await db
    .update(notifications)
    .set({ lu: true })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
}

export async function markAllNotificationsRead() {
  const userId = await currentUserId();
  if (!userId) return;
  await db
    .update(notifications)
    .set({ lu: true })
    .where(
      and(eq(notifications.userId, userId), eq(notifications.lu, false)),
    );
}
