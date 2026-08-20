import { db } from "@/db";
import { notifications } from "@/db/schema";

// Crée des notifications pour une liste de destinataires (hors l'auteur).
export async function notifier(opts: {
  userIds: (string | null | undefined)[];
  type: string;
  message: string;
  leadId?: string | null;
  acteurId?: string | null;
}) {
  const dest = [...new Set(opts.userIds.filter((id): id is string => !!id))].filter(
    (id) => id !== opts.acteurId,
  );
  if (dest.length === 0) return;
  await db.insert(notifications).values(
    dest.map((userId) => ({
      userId,
      type: opts.type,
      message: opts.message,
      leadId: opts.leadId ?? null,
      acteurId: opts.acteurId ?? null,
    })),
  );
}
