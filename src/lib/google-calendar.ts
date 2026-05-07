import { prisma } from "./prisma";
import { getDefaultUser } from "./user";

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI!;

export function getAuthUrl(state?: string) {
  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: "code",
    scope:         "https://www.googleapis.com/auth/calendar",
    access_type:   "offline",
    prompt:        "consent",
    ...(state ? { state } : {}),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode(code: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri:  REDIRECT_URI,
      grant_type:    "authorization_code",
    }),
  });
  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
  }>;
}

export async function refreshAccessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type:    "refresh_token",
    }),
  });
  return res.json() as Promise<{ access_token: string; expires_in: number }>;
}

type RefreshTokenJson = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

export type GetValidAccessTokenOptions = {
  /** Se true, falha no refresh lança Error em vez de retornar null (ex.: /api/op/calendar). */
  strictRefreshErrors?: boolean;
};

export async function getValidAccessToken(
  opts?: GetValidAccessTokenOptions,
): Promise<string | null> {
  const user = await getDefaultUser();
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  console.log("[op-calendar] dbUser google fields", {
    userId: dbUser?.id ?? user.id,
    hasRefreshToken: Boolean(dbUser?.googleRefreshToken),
    hasAccessToken: Boolean(dbUser?.googleAccessToken),
    googleTokenExpiry: dbUser?.googleTokenExpiry?.toISOString?.() ?? null,
  });
  if (!dbUser?.googleRefreshToken) return null;

  const now = new Date();
  const expiry = dbUser.googleTokenExpiry;

  // If token is still valid (with 1 min buffer), return it
  if (dbUser.googleAccessToken && expiry && expiry > new Date(now.getTime() + 60_000)) {
    return dbUser.googleAccessToken;
  }

  // Refresh token
  console.log("[op-calendar] refreshing access token");
  const tokens = (await refreshAccessToken(dbUser.googleRefreshToken)) as RefreshTokenJson;
  console.log("[op-calendar] refreshAccessToken raw", JSON.stringify(tokens));
  if (!tokens.access_token) {
    console.warn("[op-calendar] refresh failed or missing access_token", tokens);
    if (opts?.strictRefreshErrors) {
      const err = tokens.error;
      const desc = tokens.error_description;
      throw new Error(
        err
          ? `Google OAuth refresh falhou (${err})${desc ? `: ${desc}` : ""}`
          : "Google OAuth refresh não retornou access_token (verifique GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET no servidor).",
      );
    }
    return null;
  }

  const newExpiry = new Date(now.getTime() + (tokens.expires_in ?? 3600) * 1000);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      googleAccessToken: tokens.access_token,
      googleTokenExpiry: newExpiry,
    },
  });
  return tokens.access_token;
}

export type GoogleEvent = {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end:   { dateTime?: string; date?: string; timeZone?: string };
  colorId?: string;
  htmlLink?: string;
};

export async function listEvents(timeMin: string, timeMax: string): Promise<GoogleEvent[]> {
  const token = await getValidAccessToken();
  if (!token) return [];

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy:      "startTime",
    maxResults:   "250",
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.items ?? [];
}

export type CreateCalendarEventOptions = GetValidAccessTokenOptions & {
  /** Se true, erro HTTP da API Calendar vira throw com mensagem (fluxo operacional). */
  exposeCalendarApiErrors?: boolean;
};

export type ListCalendarEventsOptions = GetValidAccessTokenOptions & {
  /** Se true, erro HTTP da API Calendar vira throw com mensagem (fluxo operacional). */
  exposeCalendarApiErrors?: boolean;
};

export async function createEvent(
  event: {
    summary: string;
    description?: string;
    start: string; // ISO datetime
    end: string;
    colorId?: string;
    timeZone?: string;
    location?: string;
  },
  opts?: CreateCalendarEventOptions,
): Promise<GoogleEvent | null> {
  const token = await getValidAccessToken(opts);
  if (!token) return null;

  const tz = event.timeZone?.trim() || "America/Sao_Paulo";
  const body: Record<string, unknown> = {
    summary: event.summary,
    start: { dateTime: event.start, timeZone: tz },
    end: { dateTime: event.end, timeZone: tz },
  };
  if (event.description?.trim()) body.description = event.description.trim();
  if (event.location?.trim()) body.location = event.location.trim();
  if (event.colorId) body.colorId = event.colorId;

  const calId = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID?.trim() || "primary");
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calId}/events`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    if (opts?.exposeCalendarApiErrors) {
      let detail = res.statusText;
      try {
        const errBody = (await res.json()) as { error?: { message?: string } };
        if (errBody?.error?.message) detail = errBody.error.message;
      } catch {
        /* ignore */
      }
      throw new Error(`Não foi possível criar na Google Agenda (${res.status}): ${detail}`);
    }
    return null;
  }
  return res.json() as Promise<GoogleEvent>;
}

export async function listCalendarEvents(
  timeMin: string,
  timeMax: string,
  opts?: ListCalendarEventsOptions,
): Promise<GoogleEvent[] | null> {
  const token = await getValidAccessToken(opts);
  if (!token) return null;

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
    timeZone: "America/Sao_Paulo",
  });

  const calId = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID?.trim() || "primary");
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calId}/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) {
    if (opts?.exposeCalendarApiErrors) {
      let detail = res.statusText;
      try {
        const errBody = (await res.json()) as { error?: { message?: string } };
        if (errBody?.error?.message) detail = errBody.error.message;
      } catch {
        /* ignore */
      }
      throw new Error(`Não foi possível ler a Google Agenda (${res.status}): ${detail}`);
    }
    return [];
  }

  const data = (await res.json()) as { items?: GoogleEvent[] };
  return data.items ?? [];
}

export type UpdateCalendarEventOptions = CreateCalendarEventOptions;

export async function updateEventDateTime(
  event: {
    eventId: string;
    start: string;
    end: string;
    timeZone?: string;
  },
  opts?: UpdateCalendarEventOptions,
): Promise<GoogleEvent | null> {
  const token = await getValidAccessToken(opts);
  if (!token) return null;

  const tz = event.timeZone?.trim() || "America/Sao_Paulo";
  const body = {
    start: { dateTime: event.start, timeZone: tz },
    end: { dateTime: event.end, timeZone: tz },
  };

  const calId = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID?.trim() || "primary");
  const eventId = encodeURIComponent(event.eventId);
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${eventId}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    if (opts?.exposeCalendarApiErrors) {
      let detail = res.statusText;
      try {
        const errBody = (await res.json()) as { error?: { message?: string } };
        if (errBody?.error?.message) detail = errBody.error.message;
      } catch {
        /* ignore */
      }
      throw new Error(`Não foi possível atualizar na Google Agenda (${res.status}): ${detail}`);
    }
    return null;
  }

  return res.json() as Promise<GoogleEvent>;
}

export async function deleteEvent(eventId: string): Promise<boolean> {
  const token = await getValidAccessToken();
  if (!token) return false;

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
  );
  return res.ok || res.status === 204 || res.status === 404;
}

// Google Calendar color IDs → hex
export const GOOGLE_COLORS: Record<string, string> = {
  "1":  "#7986cb", // Lavanda
  "2":  "#33b679", // Sálvia
  "3":  "#8e24aa", // Uva
  "4":  "#e67c73", // Tomate
  "5":  "#f6c026", // Banana
  "6":  "#f5511d", // Tangerina
  "7":  "#039be5", // Pavão
  "8":  "#616161", // Grafite
  "9":  "#3f51b5", // Mirtilo
  "10": "#0b8043", // Manjericão
  "11": "#d60000", // Tomate escuro
};
