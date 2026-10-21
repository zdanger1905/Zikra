// Cleans up quran.com word timings ([[wordPos1Based, startMs, endMs], ...]) so word highlighting
// follows the recitation. Some reciters' data (e.g. Khalifah Al Tunaiji) mislabels words, like
// `4, 26, 2, 8` where 26 and 2 are really words 5–7, or has no timing for a word at all.
// Genuine repeats, where the reciter goes back a few words and continues, are kept.

export type Segment = number[]; // [wordPos1Based, startMs, endMs]

// Longest strictly increasing run of word positions (indices into `labels`), used as trusted anchors.
function anchorIndices(labels: number[]): number[] {
  const n = labels.length;
  const len = new Array(n).fill(1);
  const prev = new Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (labels[j] < labels[i] && len[j] + 1 > len[i]) {
        len[i] = len[j] + 1;
        prev[i] = j;
      }
    }
  }
  let end = 0;
  for (let i = 1; i < n; i++) if (len[i] > len[end]) end = i;
  const out: number[] = [];
  for (let i = end; i !== -1; i = prev[i]) out.unshift(i);
  return out;
}

// Splits [start, end] across consecutive words, proportionally to their weights.
function split(firstWord: number, weights: number[], start: number, end: number): Segment[] {
  const total = weights.reduce((a, b) => a + b, 0) || weights.length;
  const out: Segment[] = [];
  let t = start;
  weights.forEach((w, i) => {
    const next = i === weights.length - 1 ? end : t + ((end - start) * (w || 1)) / total;
    out.push([firstWord + i, t, next]);
    t = next;
  });
  return out;
}

// Arabic letters only (no diacritics), as a rough measure of how long a word takes to recite.
export function wordWeight(text: string) {
  return Math.max(1, (text.match(/[ء-يٱ-ۓ]/g) ?? []).length);
}

/**
 * @param raw     segments as returned by the API
 * @param weights one entry per word in the verse (e.g. from wordWeight); its length is the word count.
 *                When omitted, the word count is taken from the data and words are weighted equally.
 */
export function normalizeSegments(raw: Segment[], weights?: number[]): Segment[] {
  const segs = raw
    .filter((s) => s.length >= 3 && s.every(Number.isFinite) && s[2] > s[1])
    .map((s) => [Math.round(s[0]), s[1], s[2]])
    .sort((a, b) => a[1] - b[1]);
  if (segs.length === 0) return [];

  const anchorsAll = anchorIndices(segs.map((s) => s[0]));
  const wordCount = weights?.length ?? Math.max(...anchorsAll.map((i) => segs[i][0]));
  const w = (word: number) => weights?.[word - 1] ?? 1;
  const anchors = anchorsAll.filter((i) => segs[i][0] >= 1 && segs[i][0] <= wordCount);
  if (anchors.length === 0) return segs;

  const out: Segment[] = [];
  // Walk the gaps between anchors, with virtual anchors before word 1 and after the last word.
  const points = [-1, ...anchors, segs.length];
  for (let k = 0; k < points.length - 1; k++) {
    const a = points[k], b = points[k + 1];
    const p = a === -1 ? 0 : segs[a][0];
    const q = b === segs.length ? wordCount + 1 : segs[b][0];
    const between = segs.slice(a + 1, b);
    const missing = q - p - 1;

    if (a !== -1) out.push(segs[a]);

    if (missing <= 0) {
      // Nothing to fill: extra segments are repeats of earlier words (out-of-range labels are noise)
      out.push(...between.filter((s) => s[0] >= 1 && s[0] < q));
    } else if (between.length === missing) {
      between.forEach((s, i) => out.push([p + 1 + i, s[1], s[2]]));
    } else if (between.length > 0) {
      const ws = Array.from({ length: missing }, (_, i) => w(p + 1 + i));
      out.push(...split(p + 1, ws, between[0][1], Math.max(...between.map((s) => s[2]))));
    } else if (a !== -1) {
      // Missing words with no time of their own: share the previous anchor's time with them
      const anchor = out.pop()!;
      const ws = Array.from({ length: missing + 1 }, (_, i) => w(p + i));
      out.push(...split(p, ws, anchor[1], anchor[2]));
    } else if (b !== segs.length) {
      // Missing leading words: share the first anchor's time with them
      const first = segs[b];
      const ws = Array.from({ length: missing + 1 }, (_, i) => w(1 + i));
      const parts = split(1, ws, first[1], first[2]);
      out.push(...parts.slice(0, -1));
      segs[b] = parts[parts.length - 1];
    }
  }
  return out.sort((x, y) => x[1] - y[1]);
}
