/**
 * Extracts Muhammad Asad's footnotes from quran_asad.pdf.
 *
 * PDF structure (per page, sorted top→bottom by y coordinate):
 *   h=11  — translation text OR verse references ("2:15")
 *   h=5   — footnote number markers embedded inline in translation text
 *   h=9   — footnote content text (body + continuations)
 *   h=0   — mixed: sometimes verse refs ("2:36"), sometimes footnote content starts
 *
 * Output: public/footnotes/{surahNum}.json
 *   { verses: { "31": [23,24], ... }, texts: { "23": "Lit., ...", ... } }
 */

import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "fs";

const PDF_PATH = "C:/Users/zaydi/Downloads/quran_asad.pdf";
const OUT_DIR = "C:/Users/zaydi/muslim-hub/public/footnotes";

const pdfData = new Uint8Array(readFileSync(PDF_PATH));
const doc = await pdfjsLib.getDocument({
  data: pdfData,
  useWorkerFetch: false,
  isEvalSupported: false,
  useSystemFonts: true,
}).promise;

console.log(`PDF loaded — ${doc.numPages} pages`);

// ── State ─────────────────────────────────────────────────────────────────────
const verseFootnotes = {}; // ["surah"]["verse"] = [num, ...]
const footnoteTexts = {};  // ["surah"][num] = "text"

let currentSurah = null;
let currentVerse = null;
let currentFNNum  = null;
let currentFNSurah = null;
let currentFNLines = [];

function commitFN() {
  if (currentFNNum !== null && currentFNSurah && currentFNLines.length) {
    if (!footnoteTexts[currentFNSurah]) footnoteTexts[currentFNSurah] = {};
    footnoteTexts[currentFNSurah][currentFNNum] =
      currentFNLines.join(" ").replace(/\s+/g, " ").trim();
  }
  currentFNNum = null;
  currentFNLines = [];
}

// ── Page processing ───────────────────────────────────────────────────────────
for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
  if (pageNum % 200 === 0) console.log(`  page ${pageNum}…`);

  const page    = await doc.getPage(pageNum);
  const content = await page.getTextContent();

  // Bucket items into lines by y (±2 px)
  const byY = {};
  for (const item of content.items) {
    if (!item.str?.trim()) continue;
    const y = Math.round(item.transform[5] / 2) * 2;
    if (!byY[y]) byY[y] = { items: [], maxH: 0 };
    byY[y].items.push({ str: item.str, x: item.transform[4] });
    byY[y].maxH = Math.max(byY[y].maxH, item.height ?? 0);
  }

  const lines = Object.entries(byY)
    .map(([y, { items, maxH }]) => ({
      y: Number(y),
      h: Math.round(maxH),
      text: items
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str)
        .join("")
        .trim(),
    }))
    .filter(
      (l) =>
        l.text &&
        !/islamicbulletin|IslamicBulletin|www\./i.test(l.text) &&
        !/^\s*$/.test(l.text)
    )
    .sort((a, b) => b.y - a.y); // top → bottom

  for (const { h, text } of lines) {
    // ── Verse reference "N:M" ──────────────────────────────────────────────
    const verseRef = text.match(/^(\d{1,3}):(\d{1,3})$/);
    if (verseRef) {
      const newSurah = verseRef[1];
      const newVerse = verseRef[2];
      // Surah transition → commit current footnote
      if (newSurah !== currentSurah) commitFN();
      currentSurah = newSurah;
      currentVerse = newVerse;
      continue;
    }

    // ── Inline footnote marker (tiny superscript digit) ────────────────────
    if (h <= 6 && /^\d+$/.test(text)) {
      const num = Number(text);
      if (num > 0 && num < 1000 && currentSurah && currentVerse) {
        if (!verseFootnotes[currentSurah]) verseFootnotes[currentSurah] = {};
        if (!verseFootnotes[currentSurah][currentVerse])
          verseFootnotes[currentSurah][currentVerse] = [];
        if (!verseFootnotes[currentSurah][currentVerse].includes(num))
          verseFootnotes[currentSurah][currentVerse].push(num);
      }
      continue;
    }

    // ── Footnote content start "N <text>" ─────────────────────────────────
    const fnStart = text.match(/^(\d{1,3})\s+(.+)/);
    if (fnStart) {
      const num = Number(fnStart[1]);
      const rest = fnStart[2];
      // Guard: must be a plausible footnote number (not e.g. "2" in a date)
      if (num > 0 && num < 500 && h >= 7) {
        commitFN();
        currentFNNum   = num;
        currentFNSurah = currentSurah;
        currentFNLines = [rest];
        continue;
      }
    }

    // ── Footnote content continuation ──────────────────────────────────────
    if (currentFNNum !== null) {
      // h=9 is always footnote content; h=0 or h=11 might be translation —
      // but if a footnote is active we include it (occasional translation
      // words bleeding in are acceptable).
      if (h <= 10 || h === 0) {
        currentFNLines.push(text);
        continue;
      }
      // h=11 line while footnote active: check if it looks like continuation
      // (starts lowercase, or starts with closing quotes, "Lit.", etc.)
      if (
        /^[a-z('"–\-]/.test(text) ||
        /^(Lit\.|i\.e\.|cf\.|see |ibid|hence|thus|this|that|the |and |but |or |in |of |to |at |for |with |from |by )/.test(
          text
        )
      ) {
        currentFNLines.push(text);
        continue;
      }
      // Looks like a new translation sentence — stop current footnote
      commitFN();
    }

    // Translation text — no action needed
  }
}

commitFN();

// ── Write output ──────────────────────────────────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true });

const allSurahs = new Set([
  ...Object.keys(verseFootnotes),
  ...Object.keys(footnoteTexts),
]);

let totalVerseEntries = 0;
let totalFNTexts = 0;

for (const surah of allSurahs) {
  const payload = {
    verses: verseFootnotes[surah] ?? {},
    texts:  footnoteTexts[surah]  ?? {},
  };
  totalVerseEntries += Object.keys(payload.verses).length;
  totalFNTexts      += Object.keys(payload.texts).length;
  writeFileSync(`${OUT_DIR}/${surah}.json`, JSON.stringify(payload));
}

console.log(`\nDone!`);
console.log(`  Surahs with data : ${allSurahs.size}`);
console.log(`  Verse entries    : ${totalVerseEntries}`);
console.log(`  Footnote texts   : ${totalFNTexts}`);
