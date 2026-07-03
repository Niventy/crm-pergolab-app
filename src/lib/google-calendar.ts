// Intégration Google Agenda (Calendar API) en OAuth, par compte ADV.
// Nécessite le scope https://www.googleapis.com/auth/calendar.events dans les
// refresh tokens de GOOGLE_SENDERS (à ajouter lors de la régénération OAuth).

import { OAuth2Client } from "google-auth-library";

const CAL = "https://www.googleapis.com/calendar/v3";

async function accessToken(refreshToken: string): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const client = new OAuth2Client(clientId, clientSecret);
  client.setCredentials({ refresh_token: refreshToken });
  const at = await client.getAccessToken();
  return typeof at === "string" ? at : (at?.token ?? null);
}

export type CalEvent = {
  summary: string;
  description?: string;
  location?: string;
  // Soit un évènement horaire (startISO/endISO sans offset + fuseau Paris),
  // soit un évènement « journée entière » (allDayDate = « YYYY-MM-DD »).
  startISO?: string;
  endISO?: string;
  allDayDate?: string;
  attendeeEmail?: string | null;
};

// Crée ou met à jour l'évènement RDV. Renvoie l'id, ou null si échec.
export async function upsertCalendarEvent(
  refreshToken: string,
  eventId: string | null,
  ev: CalEvent,
  invite: boolean,
): Promise<{ id: string | null; error?: string }> {
  const token = await accessToken(refreshToken);
  if (!token) return { id: null, error: "Auth Agenda échouée." };

  const body: Record<string, unknown> = {
    summary: ev.summary,
    description: ev.description,
    location: ev.location,
  };
  if (ev.allDayDate) {
    body.start = { date: ev.allDayDate };
    body.end = { date: ev.allDayDate };
  } else {
    body.start = { dateTime: ev.startISO, timeZone: "Europe/Paris" };
    body.end = { dateTime: ev.endISO, timeZone: "Europe/Paris" };
  }
  const invited = invite && ev.attendeeEmail;
  if (invited) body.attendees = [{ email: ev.attendeeEmail }];

  const sendUpdates = invited ? "all" : "none";
  const url = eventId
    ? `${CAL}/calendars/primary/events/${eventId}?sendUpdates=${sendUpdates}`
    : `${CAL}/calendars/primary/events?sendUpdates=${sendUpdates}`;

  const res = await fetch(url, {
    method: eventId ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    return { id: null, error: `Agenda ${res.status} — ${detail.slice(0, 200)}` };
  }
  const json = (await res.json()) as { id?: string };
  return { id: json.id ?? null };
}

export async function deleteCalendarEvent(
  refreshToken: string,
  eventId: string,
): Promise<void> {
  const token = await accessToken(refreshToken);
  if (!token) return;
  await fetch(
    `${CAL}/calendars/primary/events/${eventId}?sendUpdates=all`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  );
}

export type UpcomingEvent = {
  id: string;
  summary: string;
  start: string; // ISO (horaire) ou « YYYY-MM-DD » (journée)
  allDay: boolean;
  location?: string;
  htmlLink?: string;
};

// Liste les prochains évènements de l'agenda principal du compte.
export async function listUpcomingEvents(
  refreshToken: string,
  timeMinISO: string,
  maxResults = 15,
): Promise<{ ok: boolean; events?: UpcomingEvent[]; error?: string }> {
  const token = await accessToken(refreshToken);
  if (!token) return { ok: false, error: "Auth Agenda échouée." };

  const params = new URLSearchParams({
    timeMin: timeMinISO,
    maxResults: String(maxResults),
    singleEvents: "true",
    orderBy: "startTime",
  });
  const res = await fetch(`${CAL}/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    if (res.status === 403) return { ok: false, error: "scope" };
    return { ok: false, error: `Agenda ${res.status}` };
  }
  const json = (await res.json()) as {
    items?: {
      id: string;
      summary?: string;
      location?: string;
      htmlLink?: string;
      start?: { dateTime?: string; date?: string };
    }[];
  };
  const events = (json.items ?? []).map((e) => ({
    id: e.id,
    summary: e.summary ?? "(sans titre)",
    start: e.start?.dateTime ?? e.start?.date ?? "",
    allDay: !e.start?.dateTime,
    location: e.location,
    htmlLink: e.htmlLink,
  }));
  return { ok: true, events };
}
