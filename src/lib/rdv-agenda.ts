// Synchronisation du RDV d'un lead avec l'agenda Google de l'ADV connecté.
// Partagée par la page Modifier et l'action « RDV fixé » de la fiche.
// Silencieuse en cas d'échec (scope absent, compte non configuré…).
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { resolveSender } from "@/lib/email-sender";
import { deleteCalendarEvent, upsertCalendarEvent } from "@/lib/google-calendar";

// Heure de fin = +1h (bornée à 23:59 pour rester le même jour).
export function endHeure(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  if (h >= 23) return "23:59";
  return `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export async function syncRdvAgenda(leadId: string): Promise<{ synced: boolean }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const account = resolveSender(user?.email);
    if (!account) return { synced: false };

    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (!lead) return { synced: false };
    const existingEventId = lead.rdvEventId ?? null;

    if (lead.rdvDate) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
      const summary = `RDV ${lead.nom} — Pergolab`;
      const description = [
        lead.typeProjet ? `Projet : ${lead.typeProjet}` : null,
        lead.telephone ? `Tél : ${lead.telephone}` : null,
        `Fiche : ${appUrl}/leads/${leadId}`,
      ]
        .filter(Boolean)
        .join("\n");
      const location =
        lead.adressePose ??
        [lead.adresse, [lead.codePostal, lead.ville].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join(", ") ??
        undefined;
      const ev = lead.rdvHeure
        ? {
            summary,
            description,
            location: location || undefined,
            startISO: `${lead.rdvDate}T${lead.rdvHeure}:00`,
            endISO: `${lead.rdvDate}T${endHeure(lead.rdvHeure)}:00`,
            attendeeEmail: lead.email,
          }
        : {
            summary,
            description,
            location: location || undefined,
            allDayDate: lead.rdvDate,
            attendeeEmail: lead.email,
          };
      const r = await upsertCalendarEvent(account.refreshToken, existingEventId, ev, true);
      if (r.id && r.id !== existingEventId)
        await db.update(leads).set({ rdvEventId: r.id }).where(eq(leads.id, leadId));
      return { synced: !!r.id };
    }
    if (existingEventId) {
      await deleteCalendarEvent(account.refreshToken, existingEventId);
      await db.update(leads).set({ rdvEventId: null }).where(eq(leads.id, leadId));
    }
    return { synced: true };
  } catch (e) {
    console.error("Sync Google Agenda échouée:", e);
    return { synced: false };
  }
}
