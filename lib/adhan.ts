// Shared between the adhan page and the server-side scheduler.

export type PrayerKey = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";

export type PrayerToggles = Record<PrayerKey, boolean>;

export interface SpeakerSelection {
  groupId: string;
  name: string;
  playerIds: string[];
}

// Stored at users/{uid}/adhan/settings. Sonos tokens are kept server-side only.
export interface AdhanSettings {
  speaker: SpeakerSelection | null;
  prayers: PrayerToggles;
  adhanAudio: string;
  volume: number;
  location: { city: string; country: string } | null;
}

export const PRAYER_KEYS: PrayerKey[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

export const ADHAN_OPTIONS = [
  { id: "makkah",  label: "Makkah",             url: "https://www.islamcan.com/audio/adhan/azan1.mp3" },
  { id: "madinah", label: "Madinah",            url: "https://www.islamcan.com/audio/adhan/azan2.mp3" },
  { id: "egypt",   label: "Egyptian (Classic)", url: "https://www.islamcan.com/audio/adhan/azan3.mp3" },
  { id: "turkey",  label: "Turkish",            url: "https://www.islamcan.com/audio/adhan/azan4.mp3" },
];

export const DEFAULT_SETTINGS: AdhanSettings = {
  speaker: null,
  prayers: { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true },
  adhanAudio: "makkah",
  volume: 40,
  location: null,
};

export function adhanUrl(id: string) {
  return (ADHAN_OPTIONS.find((a) => a.id === id) ?? ADHAN_OPTIONS[0]).url;
}

export function normalizeSettings(raw: Partial<AdhanSettings> | undefined): AdhanSettings {
  return {
    speaker: raw?.speaker ?? null,
    prayers: { ...DEFAULT_SETTINGS.prayers, ...raw?.prayers },
    adhanAudio: raw?.adhanAudio ?? DEFAULT_SETTINGS.adhanAudio,
    volume: raw?.volume ?? DEFAULT_SETTINGS.volume,
    location: raw?.location ?? null,
  };
}
