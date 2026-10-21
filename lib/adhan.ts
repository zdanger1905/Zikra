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
  speakers: SpeakerSelection[];
  prayers: PrayerToggles;
  adhanAudio: string;
  volume: number;
  location: { city: string; country: string } | null;
}

export const PRAYER_KEYS: PrayerKey[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

// `preview` is the opening "Allahu Akbar, Allahu Akbar" of each recording, served from /public.
export const ADHAN_OPTIONS = [
  { id: "makkah",  label: "Makkah",             url: "https://www.islamcan.com/audio/adhan/azan1.mp3", preview: "/adhan-previews/makkah.mp3" },
  { id: "madinah", label: "Madinah",            url: "https://www.islamcan.com/audio/adhan/azan2.mp3", preview: "/adhan-previews/madinah.mp3" },
  { id: "egypt",   label: "Egyptian (Classic)", url: "https://www.islamcan.com/audio/adhan/azan3.mp3", preview: "/adhan-previews/egypt.mp3" },
  { id: "turkey",  label: "Turkish",            url: "https://www.islamcan.com/audio/adhan/azan4.mp3", preview: "/adhan-previews/turkey.mp3" },
];

export const DEFAULT_SETTINGS: AdhanSettings = {
  speakers: [],
  prayers: { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true },
  adhanAudio: "makkah",
  volume: 40,
  location: null,
};

export function adhanOption(id: string) {
  return ADHAN_OPTIONS.find((a) => a.id === id) ?? ADHAN_OPTIONS[0];
}

// Earlier versions stored a single `speaker`; fold it into `speakers`.
export function normalizeSettings(
  raw: (Partial<AdhanSettings> & { speaker?: SpeakerSelection | null }) | undefined
): AdhanSettings {
  return {
    speakers: raw?.speakers ?? (raw?.speaker ? [raw.speaker] : []),
    prayers: { ...DEFAULT_SETTINGS.prayers, ...raw?.prayers },
    adhanAudio: raw?.adhanAudio ?? DEFAULT_SETTINGS.adhanAudio,
    volume: raw?.volume ?? DEFAULT_SETTINGS.volume,
    location: raw?.location ?? null,
  };
}
