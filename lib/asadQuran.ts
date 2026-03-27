/**
 * Helper for querying Muhammad Asad's annotated Quran translation.
 *
 * Data shape (public/quran_asad_annotated.json):
 *   ayahs     – Record<"surah:verse", string>  (text with [FN:N] markers embedded)
 *   footnotes – Record<surahNum, Record<fnNum, string>>
 *
 * [GROUPED WITH S:V] prefix: 47 verses where Asad's translation combines two
 * consecutive verses into one block.  The grouped verse is an alias — its text
 * is identical to the host verse (S:V) and footnote lookups use the host surah.
 */

// ─── Public types ─────────────────────────────────────────────────────────────

export interface AsadData {
  ayahs: Record<string, string>;
  footnotes: Record<string, Record<string, string>>;
}

/** A footnote referenced in a verse. */
export interface AsadFootnote {
  number: number;
  text: string;
}

/**
 * One item in the ordered rendering sequence.
 * Iterate segments in order to reconstruct the verse with markers in place:
 *   - type "text"     → render as plain text
 *   - type "footnote" → render as a superscript / clickable marker
 */
export type AsadSegment =
  | { type: "text"; content: string }
  | { type: "footnote"; number: number; text: string };

export interface AsadAyah {
  /** Canonical key, e.g. "2:5" */
  key: string;
  /**
   * Ordered segments — interleave text and footnote markers exactly as they
   * appear in Asad's original.  Safe to map directly for rendering.
   */
  segments: AsadSegment[];
  /** All footnotes referenced in this verse, in document order. */
  footnotes: AsadFootnote[];
  /**
   * Set when this verse is grouped with another.
   * Value is the host verse key, e.g. "5:27".
   * The segments/footnotes are derived from the host text.
   */
  groupedWith?: string;
}

// ─── Internal constants ───────────────────────────────────────────────────────

const FN_RE = /\[FN:(\d+)\]/g;
const GROUPED_RE = /^\[GROUPED WITH (\d+:\d+)\]\s*/;

// ─── Main query function ──────────────────────────────────────────────────────

/**
 * Look up a single verse by surah + verse number.
 *
 * Returns null if the verse key is absent from the dataset.
 *
 * Grouped aliases are resolved transparently: the returned segments come from
 * the host verse text, and `groupedWith` is set so the UI can surface this if
 * desired (e.g. "Combined with 5:27").
 *
 * Footnote texts are resolved against the surah's footnote map.  Numbers that
 * exist as markers in the text but have no corresponding footnote entry get an
 * empty string for `text` (graceful degradation).
 *
 * @example
 *   const ayah = getAyah(2, 5, data);
 *   ayah.segments.forEach(seg => {
 *     if (seg.type === 'text') render(seg.content);
 *     else                     renderFootnoteDot(seg.number, seg.text);
 *   });
 */
export function getAyah(
  surah: number,
  verse: number,
  data: AsadData
): AsadAyah | null {
  const key = `${surah}:${verse}`;
  let rawText = data.ayahs[key];
  if (rawText === undefined) return null;

  // ── Resolve grouped alias ──────────────────────────────────────────────────
  let groupedWith: string | undefined;
  const groupedMatch = rawText.match(GROUPED_RE);
  if (groupedMatch) {
    groupedWith = groupedMatch[1];
    // Strip the prefix — the rest is the full combined text
    rawText = rawText.slice(groupedMatch[0].length);
    // Footnote numbers in grouped text belong to the host surah
    // (which is the same surah in every known case, but we derive it from the
    // groupedWith key to be safe)
    surah = parseInt(groupedWith.split(":")[0], 10);
  }

  return parseText(key, rawText, surah, data, groupedWith);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * The source JSON has two footnote marker styles:
 *   1. [FN:N]   – explicit bracketed form (most markers)
 *   2. bare N   – digit(s) directly after a letter/punctuation, e.g. "truth6--"
 *
 * This function converts style 2 → style 1 so the rest of the parser only
 * needs to handle a single format.  A bare number is only promoted to a
 * footnote marker when the number actually exists in the surah's footnote
 * dictionary — this prevents real numbers in the text from being misread.
 */
function normalizeBareMarkers(
  text: string,
  surahFootnotes: Record<string, string>
): string {
  // Matches a digit run that:
  //   - is immediately preceded by a letter or closing punctuation (!"'])
  //   - is immediately followed by a non-word character (-- . , ; " ' space …)
  return text.replace(
    /([a-zA-Z!"'\]])(\d{1,3})(?=\W)/g,
    (match, pre, num) => (surahFootnotes[num] ? `${pre}[FN:${num}]` : match)
  );
}

function parseText(
  key: string,
  text: string,
  surah: number,
  data: AsadData,
  groupedWith?: string
): AsadAyah {
  const surahFootnotes = data.footnotes[String(surah)] ?? {};

  // Promote bare footnote numbers (e.g. truth6--) to [FN:N] form
  const normalised = normalizeBareMarkers(text, surahFootnotes);

  // split() with a capture group produces alternating [text, fnNum, text, …]
  const parts = normalised.split(FN_RE);

  const segments: AsadSegment[] = [];
  const footnotes: AsadFootnote[] = [];

  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      // Plain text chunk
      if (parts[i]) segments.push({ type: "text", content: parts[i] });
    } else {
      // Footnote marker
      const number = parseInt(parts[i], 10);
      const fnText = surahFootnotes[String(number)] ?? "";
      const fn: AsadFootnote = { number, text: fnText };
      footnotes.push(fn);
      segments.push({ type: "footnote", number, text: fnText });
    }
  }

  return { key, segments, footnotes, groupedWith };
}

// ─── Footnote body text — reference parsing ───────────────────────────────────

/**
 * One segment of a parsed footnote body.
 * Iterate in order to render text with hyperlinked cross-references.
 */
export type FootnoteSegment =
  | { type: "text"; content: string }
  | { type: "ref"; display: string; surah: number; verse: number; verseEnd?: number; footnoteNum?: number };

/**
 * Given a surah + footnote number, return the verse number that carries that
 * footnote marker.  Checks both [FN:N] and bare-number forms.
 * Returns null if not found (data gap or invalid reference).
 */
export function findVerseForFootnote(
  surah: number,
  fnNum: number,
  data: AsadData
): number | null {
  const prefix = `${surah}:`;
  const fmtMarker = `[FN:${fnNum}]`;
  const surahFns = data.footnotes[String(surah)] ?? {};

  for (const [key, text] of Object.entries(data.ayahs)) {
    if (!key.startsWith(prefix)) continue;
    if (text.startsWith("[GROUPED WITH")) continue;

    if (text.includes(fmtMarker)) return parseInt(key.split(":")[1], 10);

    // Also check bare number form (e.g. truth6--)
    if (surahFns[String(fnNum)] && text.includes(String(fnNum))) {
      if (normalizeBareMarkers(text, surahFns).includes(fmtMarker))
        return parseInt(key.split(":")[1], 10);
    }
  }

  // Fallback: footnote exists in data but has no verse marker (data gap).
  // Interpolate from the nearest neighboring footnote that does have a marker.
  if (!surahFns[String(fnNum)]) return null;
  for (let delta = 1; delta <= 20; delta++) {
    for (const candidate of [fnNum - delta, fnNum + delta]) {
      if (candidate < 1) continue;
      for (const [key, text] of Object.entries(data.ayahs)) {
        if (!key.startsWith(prefix)) continue;
        if (text.startsWith("[GROUPED WITH")) continue;
        if (text.includes(`[FN:${candidate}]`)) return parseInt(key.split(":")[1], 10);
      }
    }
  }
  return null;
}

interface RawRef {
  start: number;
  end: number;
  display: string;
  surah: number;
  verse: number;
  verseEnd?: number;
  footnoteNum?: number;
}

/**
 * Parse a footnote body string and extract all cross-references to other
 * verses/footnotes.  Returns an ordered array of text and ref segments ready
 * for rendering as hyperlinks.
 *
 * Patterns handled (highest to lowest specificity):
 *   note N on S:V                    →  surah S, verse V, footnote N
 *   note N on verse V of this surah  →  currentSurah, verse V, footnote N
 *   surah S, note N                  →  surah S, footnote N (verse looked up)
 *   verse V of this surah            →  currentSurah, verse V
 *   S:V                              →  surah S, verse V
 *   note N above/below               →  currentSurah, footnote N (verse looked up)
 *   note N  (standalone)             →  currentSurah, footnote N (verse looked up)
 */
export function parseFootnoteText(
  text: string,
  currentSurah: number,
  data: AsadData
): FootnoteSegment[] {
  const refs: RawRef[] = [];

  function push(m: RegExpExecArray, surah: number, verse: number | null, footnoteNum?: number) {
    if (verse === null) return;
    // Validate the verse exists in our data
    const key = `${surah}:${verse}`;
    if (!data.ayahs[key]) return;
    refs.push({ start: m.index, end: m.index + m[0].length, display: m[0], surah, verse, footnoteNum });
  }

  let m: RegExpExecArray | null;

  // P1: "note N on S:V"  →  fn N, surah S, verse V (all explicit)
  const P1 = /\bnotes?\s+(\d+)\s+on\s+(\d{1,3}):(\d{1,3})\b/gi;
  while ((m = P1.exec(text)) !== null)
    push(m, parseInt(m[2], 10), parseInt(m[3], 10), parseInt(m[1], 10));

  // P2: "note N on verse V of this surah"
  const P2 = /\bnotes?\s+(\d+)\s+on\s+verse\s+(\d+)\s+of\s+this\s+surah\b/gi;
  while ((m = P2.exec(text)) !== null)
    push(m, currentSurah, parseInt(m[2], 10), parseInt(m[1], 10));

  // P3: "surah S, note N" / "surah S, first part of note N" / "surah S and the corresponding note N" etc.
  const P3 = /\bsurah\s+(\d+)[^;.\d\n]{0,40}?notes?\s+(\d+)\b/gi;
  while ((m = P3.exec(text)) !== null) {
    const s = parseInt(m[1], 10);
    const fn = parseInt(m[2], 10);
    push(m, s, findVerseForFootnote(s, fn, data), fn);
  }

  // P4: "verse V of this surah"
  const P4 = /\bverse\s+(\d+)\s+of\s+this\s+surah\b/gi;
  while ((m = P4.exec(text)) !== null)
    push(m, currentSurah, parseInt(m[1], 10));

  // P4b: bare "verse N" (not followed by "of surah" or "of this surah") → current surah
  const P4b = /\bverse\s+(\d+)(?!\s+of\s+(?:this\s+)?surah)\b/gi;
  while ((m = P4b.exec(text)) !== null)
    push(m, currentSurah, parseInt(m[1], 10));

  // P5a: "S:V-V2" or "S:V–V2" verse range (en-dash or hyphen)
  const P5a = /\b(\d{1,3}):\s*(\d{1,3})\s*[-–]\s*(\d{1,3})\b/g;
  while ((m = P5a.exec(text)) !== null) {
    const s = parseInt(m[1], 10);
    const v1 = parseInt(m[2], 10);
    const v2 = parseInt(m[3], 10);
    if (!data.ayahs[`${s}:${v1}`]) continue;
    refs.push({ start: m.index, end: m.index + m[0].length, display: m[0], surah: s, verse: v1, verseEnd: v2 });
  }

  // P5: explicit "S:V" or "S: V" (optional space after colon)
  const P5 = /\b(\d{1,3}):\s*(\d{1,3})\b/g;
  while ((m = P5.exec(text)) !== null)
    push(m, parseInt(m[1], 10), parseInt(m[2], 10));

  // P6: "note N above" / "note N below"
  const P6 = /\bnotes?\s+(\d+)\s+(?:above|below)\b/gi;
  while ((m = P6.exec(text)) !== null) {
    const fn = parseInt(m[1], 10);
    push(m, currentSurah, findVerseForFootnote(currentSurah, fn, data), fn);
  }

  // P7: standalone "note N" (lowest priority — catches everything remaining)
  const P7 = /\bnotes?\s+(\d+)\b/gi;
  while ((m = P7.exec(text)) !== null) {
    const fn = parseInt(m[1], 10);
    push(m, currentSurah, findVerseForFootnote(currentSurah, fn, data), fn);
  }

  // Sort: earlier start first; for same start, longer span wins
  refs.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

  // Remove overlapping matches (first / longest wins)
  const kept: RawRef[] = [];
  let cursor = 0;
  for (const r of refs) {
    if (r.start >= cursor) { kept.push(r); cursor = r.end; }
  }

  // Build segment array
  const segments: FootnoteSegment[] = [];
  let pos = 0;
  for (const r of kept) {
    if (r.start > pos) segments.push({ type: "text", content: text.slice(pos, r.start) });
    segments.push({ type: "ref", display: r.display, surah: r.surah, verse: r.verse, verseEnd: r.verseEnd, footnoteNum: r.footnoteNum });
    pos = r.end;
  }
  if (pos < text.length) segments.push({ type: "text", content: text.slice(pos) });

  return segments.length ? segments : [{ type: "text", content: text }];
}
