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

export async function getValidAccessToken(): Promise<string | null> {
  const user = await getDefaultUser();
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser?.googleRefreshToken) return null;

  const now = new Date();
  const expiry = dbUser.googleTokenExpiry;

  // If token is still valid (with 1 min buffer), return it
  if (dbUser.googleAccessToken && expiry && expiry > new Date(now.getTime() + 60_000)) {
    return dbUser.googleAccessToken;
  }

  // Refresh token
  const tokens = await refreshAccessToken(dbUser.googleRefreshToken);
  if (!tokens.access_token) return null;

  const newExpiry = new Date(now.getTime() + tokens.expires_in * 1000);
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

export async function createEvent(event: {
  summary: string;
  description?: string;
  start: string; // ISO datetime
  end: string;
  colorId?: string;
}): Promise<GoogleEvent | null> {
  const token = await getValidAccessToken();
  if (!token) return null;

  const body = {
    summary:     event.summary,
    description: event.description,
    start: { dateTime: event.start, timeZone: "America/Sao_Paulo" },
    end:   { dateTime: event.end,   timeZone: "America/Sao_Paulo" },
    ...(event.colorId ? { colorId: event.colorId } : {}),
  };

  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    }
  );
  if (!res.ok) return null;
  return res.json();
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
