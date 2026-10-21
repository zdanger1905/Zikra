import { adminDb } from "@/lib/firebaseAdmin";
import { refreshAccessToken, playAudioClip } from "@/lib/sonos";
import { adhanUrl, normalizeSettings, PRAYER_KEYS, type AdhanSettings, type PrayerKey } from "@/lib/adhan";

// Collections only the server touches (Firestore rules should deny client access).
export const CONNECTIONS = "sonosConnections";
export const OAUTH_STATES = "sonosOAuthStates";

// How long after a prayer time a missed tick may still trigger the adhan.
const FIRE_WINDOW_MINUTES = 10;

export interface SonosConnection {
  accessToken: string;
  refreshToken: string;
  tokenExpiry: number;
  householdId: string;
  schedule?: DaySchedule;
}

interface DaySchedule {
  date: string;           // YYYY-MM-DD in the user's timezone
  locationKey: string;
  timezone: string;
  times: Record<PrayerKey, string>; // HH:MM local
  played: PrayerKey[];
}

export async function getConnection(uid: string): Promise<SonosConnection | null> {
  const snap = await adminDb().collection(CONNECTIONS).doc(uid).get();
  return snap.exists ? (snap.data() as SonosConnection) : null;
}

export async function getSettings(uid: string): Promise<AdhanSettings> {
  const snap = await adminDb().doc(`users/${uid}/adhan/settings`).get();
  return normalizeSettings(snap.data());
}

// Returns a usable access token, refreshing and persisting it if close to expiry.
export async function getValidToken(uid: string, conn: SonosConnection): Promise<string | null> {
  if (Date.now() < conn.tokenExpiry - 5 * 60 * 1000) return conn.accessToken;

  const refreshed = await refreshAccessToken(conn.refreshToken);
  if (!refreshed.access_token) return null;

  const update = {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? conn.refreshToken,
    tokenExpiry: Date.now() + (refreshed.expires_in ?? 86400) * 1000,
  };
  await adminDb().collection(CONNECTIONS).doc(uid).update(update);
  return update.accessToken;
}

export type PlayResult = { ok: true } | { ok: false; error: string };

export async function playAdhanForUser(
  uid: string,
  conn?: SonosConnection | null,
  settings?: AdhanSettings
): Promise<PlayResult> {
  conn ??= await getConnection(uid);
  if (!conn) return { ok: false, error: "not_connected" };
  settings ??= await getSettings(uid);
  if (!settings.speaker?.playerIds.length) return { ok: false, error: "no_speaker" };

  const token = await getValidToken(uid, conn);
  if (!token) return { ok: false, error: "token_expired" };

  const url = adhanUrl(settings.adhanAudio);
  const results = await Promise.all(
    settings.speaker.playerIds.map((id) => playAudioClip(token, id, url, settings.volume))
  );
  return results.some(Boolean) ? { ok: true } : { ok: false, error: "play_failed" };
}

// ─── Scheduling ───────────────────────────────────────────────────────────────

function localParts(timezone: string, at = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(at).map((p) => [p.type, p.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

async function fetchTimings(city: string, country: string, date?: string) {
  // Aladhan expects DD-MM-YYYY in the path.
  const datePath = date ? `/${date.split("-").reverse().join("-")}` : "";
  const res = await fetch(
    `https://api.aladhan.com/v1/timingsByCity${datePath}?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=2`
  );
  const d = await res.json();
  if (!d.data?.timings) throw new Error("timings_unavailable");
  const t: Record<string, string> = d.data.timings;
  const clean = (s: string) => s.replace(/\s*\(.*\)/, "").trim();
  return {
    timezone: d.data.meta.timezone as string,
    times: {
      fajr: clean(t.Fajr), dhuhr: clean(t.Dhuhr), asr: clean(t.Asr),
      maghrib: clean(t.Maghrib), isha: clean(t.Isha),
    },
  };
}

async function scheduleForToday(
  existing: DaySchedule | undefined,
  location: { city: string; country: string }
): Promise<DaySchedule> {
  const locationKey = `${location.city}|${location.country}`.toLowerCase();

  if (existing && existing.locationKey === locationKey) {
    const today = localParts(existing.timezone).date;
    if (existing.date === today) return existing;
    const { timezone, times } = await fetchTimings(location.city, location.country, today);
    return { date: today, locationKey, timezone, times, played: [] };
  }

  // New location: learn its timezone first, then make sure we have the local date's timings.
  let { timezone, times } = await fetchTimings(location.city, location.country);
  const today = localParts(timezone).date;
  ({ timezone, times } = await fetchTimings(location.city, location.country, today));
  return { date: today, locationKey, timezone, times, played: [] };
}

export interface TickSummary {
  checked: number;
  played: string[];
  errors: string[];
}

// Called every minute by the cron job. Plays the adhan for any user whose prayer time has just arrived.
export async function runAdhanTick(): Promise<TickSummary> {
  const db = adminDb();
  const snaps = await db.collection(CONNECTIONS).get();
  const summary: TickSummary = { checked: snaps.size, played: [], errors: [] };

  await Promise.all(
    snaps.docs.map(async (snap) => {
      const uid = snap.id;
      try {
        const conn = snap.data() as SonosConnection;
        const settings = await getSettings(uid);
        if (!settings.location || !settings.speaker) return;

        const schedule = await scheduleForToday(conn.schedule, settings.location);
        if (schedule !== conn.schedule) await snap.ref.update({ schedule });

        const now = localParts(schedule.timezone).minutes;
        const due = PRAYER_KEYS.find((p) => {
          if (!settings.prayers[p] || schedule.played.includes(p)) return false;
          const diff = now - toMinutes(schedule.times[p]);
          return diff >= 0 && diff < FIRE_WINDOW_MINUTES;
        });
        if (!due) return;

        // Claim this prayer in a transaction so overlapping ticks can't play it twice.
        const claimed = await db.runTransaction(async (tx) => {
          const fresh = (await tx.get(snap.ref)).data() as SonosConnection | undefined;
          const s = fresh?.schedule;
          if (!s || s.date !== schedule.date || s.played.includes(due)) return false;
          tx.update(snap.ref, { "schedule.played": [...s.played, due] });
          return true;
        });
        if (!claimed) return;

        const result = await playAdhanForUser(uid, conn, settings);
        if (result.ok) summary.played.push(`${uid}:${due}`);
        else summary.errors.push(`${uid}:${due}:${result.error}`);
      } catch (e) {
        summary.errors.push(`${uid}:${e instanceof Error ? e.message : "unknown"}`);
      }
    })
  );

  return summary;
}
