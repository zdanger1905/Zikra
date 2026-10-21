// Shared between the adhan page and the server-side scheduler.

export type PrayerKey = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";

// full: the whole adhan. quick: both opening "Allahu Akbar" pairs plus the closing "La ilaha illallah".
export type AdhanType = "full" | "quick";

// What gets played: an adhan type, or the short opening used by the test button.
export type AdhanClip = AdhanType | "preview";

export interface PrayerSetting {
  enabled: boolean;
  volume: number;
  type: AdhanType;
}

export type PrayerSettings = Record<PrayerKey, PrayerSetting>;

export interface SpeakerSelection {
  groupId: string;
  name: string;
  playerIds: string[];
}

// Stored at users/{uid}/adhan/settings. Sonos tokens are kept server-side only.
export interface AdhanSettings {
  speakers: SpeakerSelection[];
  prayers: PrayerSettings;
  adhanAudio: string;
  volume: number; // used by the test buttons
  location: { city: string; country: string } | null;
}

export const PRAYER_KEYS: PrayerKey[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

// `preview` and `quick` are trimmed from each recording and served from /public.
export const ADHAN_OPTIONS = [
  { id: "makkah",  label: "Makkah",             url: "https://www.islamcan.com/audio/adhan/azan1.mp3", preview: "/adhan-previews/makkah.mp3",  quick: "/adhan-quick/makkah.mp3" },
  { id: "madinah", label: "Madinah",            url: "https://www.islamcan.com/audio/adhan/azan2.mp3", preview: "/adhan-previews/madinah.mp3", quick: "/adhan-quick/madinah.mp3" },
  { id: "egypt",   label: "Egyptian (Classic)", url: "https://www.islamcan.com/audio/adhan/azan3.mp3", preview: "/adhan-previews/egypt.mp3",   quick: "/adhan-quick/egypt.mp3" },
  { id: "turkey",  label: "Turkish",            url: "https://www.islamcan.com/audio/adhan/azan4.mp3", preview: "/adhan-previews/turkey.mp3",  quick: "/adhan-quick/turkey.mp3" },
];

const DEFAULT_VOLUME = 40;

const defaultPrayer = (volume = DEFAULT_VOLUME): PrayerSetting => ({ enabled: true, volume, type: "full" });

export const DEFAULT_SETTINGS: AdhanSettings = {
  speakers: [],
  prayers: {
    fajr: defaultPrayer(), dhuhr: defaultPrayer(), asr: defaultPrayer(),
    maghrib: defaultPrayer(), isha: defaultPrayer(),
  },
  adhanAudio: "makkah",
  volume: DEFAULT_VOLUME,
  location: null,
};

export function adhanOption(id: string) {
  return ADHAN_OPTIONS.find((a) => a.id === id) ?? ADHAN_OPTIONS[0];
}

// Absolute URL Sonos should stream for a clip. Trimmed clips live on our own site.
export function clipUrl(adhanId: string, clip: AdhanClip, origin: string) {
  const option = adhanOption(adhanId);
  return clip === "full" ? option.url : `${origin}${option[clip]}`;
}

type LegacySettings = Omit<Partial<AdhanSettings>, "prayers"> & {
  speaker?: SpeakerSelection | null;
  prayers?: Partial<Record<PrayerKey, boolean | Partial<PrayerSetting>>>;
};

// Earlier versions stored a single `speaker`, on/off booleans per prayer and one shared volume.
export function normalizeSettings(raw: LegacySettings | undefined): AdhanSettings {
  const volume = raw?.volume ?? DEFAULT_VOLUME;
  const prayers = Object.fromEntries(
    PRAYER_KEYS.map((key) => {
      const p = raw?.prayers?.[key];
      const base = defaultPrayer(volume);
      return [key, typeof p === "boolean" ? { ...base, enabled: p } : { ...base, ...p }];
    })
  ) as PrayerSettings;

  return {
    speakers: raw?.speakers ?? (raw?.speaker ? [raw.speaker] : []),
    prayers,
    adhanAudio: raw?.adhanAudio ?? DEFAULT_SETTINGS.adhanAudio,
    volume,
    location: raw?.location ?? null,
  };
}

// True if the stored doc predates the current shape and should be rewritten.
export function isLegacySettings(raw: Record<string, unknown>) {
  const prayers = raw.prayers as Record<string, unknown> | undefined;
  return "sonos" in raw || "speaker" in raw || PRAYER_KEYS.some((k) => typeof prayers?.[k] === "boolean");
}
