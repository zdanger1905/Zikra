// Reader preferences for the Quran pages, chosen in the surah settings and kept in localStorage.

export type QuranFontId = "indopak" | "uthmani" | "amiri";

// `family` is the CSS font-family; the fonts are declared in globals.css (IndoPak, Uthmani)
// or loaded from Google Fonts in the root layout (Amiri Quran).
// `qpcText`: show quran.com's text_qpc_hafs instead of text_uthmani. The KFGQPC font can't attach
// text_uthmani's silent-alif mark (U+06DF) in Safari and draws it on a dotted circle; the QPC
// encoding uses marks it supports. Both texts have the same words, so translations and audio stay in sync.
export const QURAN_FONTS: { id: QuranFontId; label: string; description: string; family: string; qpcText: boolean }[] = [
  { id: "indopak", label: "IndoPak",     description: "South Asian Naskh style", family: "'ArabicFont'",  qpcText: false },
  { id: "uthmani", label: "Uthmani",     description: "Madinah Mushaf (KFGQPC)", family: "'Hafs'",        qpcText: true },
  { id: "amiri",   label: "Amiri Quran", description: "Classic Naskh typeface",  family: "'Amiri Quran'", qpcText: false },
];

export const DEFAULT_FONT: QuranFontId = "indopak";

// `id` is the quran.com (QDC) reciter id used for chapter audio with word timings
// (list: https://api.qurancdn.com/api/qdc/audio/reciters). Timings are cleaned by lib/audioSegments.ts.
export const RECITERS: { id: number; name: string }[] = [
  { id: 7,   name: "Mishary Rashid al-Afasy" },
  { id: 161, name: "Khalifa Al Tunaiji" },
];

export const DEFAULT_RECITER = 7;

export function quranFont(id: QuranFontId) {
  return QURAN_FONTS.find((f) => f.id === id) ?? QURAN_FONTS[0];
}

function readSetting(key: string) {
  try {
    return typeof window !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

export function loadFont(): QuranFontId {
  const saved = readSetting("surah-font");
  return QURAN_FONTS.some((f) => f.id === saved) ? (saved as QuranFontId) : DEFAULT_FONT;
}

export function loadReciter(): number {
  const saved = Number(readSetting("surah-reciter"));
  return RECITERS.some((r) => r.id === saved) ? saved : DEFAULT_RECITER;
}
