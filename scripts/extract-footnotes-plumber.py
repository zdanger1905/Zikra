"""
Extract Muhammad Asad's footnotes from quran_asad.pdf using pdfplumber.

PDF structure (confirmed via char inspection):
  size=11.0 — translation body text AND verse refs ("2:15")
  size= 5.0, color=(0.502,0,0) — footnote superscript markers
  size= 9.5 — footnote content text ("9 It would seem..." + continuations)
  size=10.0 — watermark / page numbers (filtered)

Placement technique:
  attaches_after is read directly from footnote_placements_full.json.
  The lookup key is (pdf_page, marker_index_on_page), where
  marker_index_on_page is the 1-based count of superscript markers
  encountered on that page so far (in top-to-bottom, left-to-right order).

Output: public/footnotes/{surahNum}.json
  {
    "verses": { "31": [23, 24], ... },
    "texts": {
      "23": {
        "text": "Lit., ...",
        "attaches_after": "word",
        "page": 42,
        "surah_ayah": "2:31"
      }
    }
  }
"""

import re
import json
import os
import pdfplumber
from collections import defaultdict

PDF_PATH       = r"C:\Users\zaydi\Downloads\quran_asad.pdf"
OUT_DIR        = r"C:\Users\zaydi\muslim-hub\public\footnotes"
PLACEMENTS_PATH = r"C:\Users\zaydi\Downloads\footnote_placements_full.json"

os.makedirs(OUT_DIR, exist_ok=True)

VERSE_RE = re.compile(r"^(\d{1,3}):(\d{1,3})$")

# ── Load placement lookup ─────────────────────────────────────────────────────

with open(PLACEMENTS_PATH, encoding="utf-8") as f:
    _raw = json.load(f)

# key: (pdf_page, marker_index_on_page)  →  after_word (trailing punctuation stripped)
placements: dict[tuple, str] = {}
for entry in _raw:
    key = (entry["pdf_page"], entry["marker_index_on_page"])
    word = entry["after_word"].strip(".,;:!?\"'[]()")
    placements[key] = word

print(f"Loaded {len(placements)} placement entries.")

# ── Helpers ───────────────────────────────────────────────────────────────────

def group_chars_into_lines(chars, y_tol=2):
    """Group chars by top-y into lines, sorted top→bottom."""
    lines = []
    for c in sorted(chars, key=lambda c: c["top"]):
        placed = False
        for line in lines:
            if abs(c["top"] - line[0]["top"]) <= y_tol:
                line.append(c)
                placed = True
                break
        if not placed:
            lines.append([c])
    return lines


def chars_to_text(chars):
    """Reconstruct text from char list sorted by x."""
    return "".join(c["text"] for c in sorted(chars, key=lambda c: c["x0"])).strip()


def is_dark_red(color):
    """Return True if color matches the superscript dark-red ~(0.502, 0, 0)."""
    if isinstance(color, (list, tuple)) and len(color) >= 3:
        r, g, b = color[0], color[1], color[2]
        return abs(r - 0.502) < 0.05 and g < 0.05 and b < 0.05
    return False


# ── State ─────────────────────────────────────────────────────────────────────

fn_texts: dict[tuple, str] = {}
verse_footnotes: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))
fn_meta: dict[tuple, dict] = {}

current_surah: str | None = None
current_ayah:  str | None = None

fn_state_surah: str | None = None
fn_state_num:   int | None = None
fn_state_parts: list[str]  = []


def commit_fn():
    global fn_state_surah, fn_state_num, fn_state_parts
    if fn_state_num is not None and fn_state_surah and fn_state_parts:
        key = (fn_state_surah, fn_state_num)
        text = " ".join(fn_state_parts).strip()
        text = re.sub(r"\s+", " ", text)
        if key not in fn_texts:
            fn_texts[key] = text
        else:
            fn_texts[key] += " " + text
    fn_state_num   = None
    fn_state_surah = None
    fn_state_parts = []


# ── Main loop ─────────────────────────────────────────────────────────────────

print("Processing PDF…")

with pdfplumber.open(PDF_PATH) as pdf:
    total = len(pdf.pages)

    for page_idx, page in enumerate(pdf.pages):
        if (page_idx + 1) % 200 == 0:
            print(f"  page {page_idx + 1}/{total}…")

        page_num = page_idx + 1
        chars = page.chars
        if not chars:
            continue

        # Count superscript markers found on this page (1-based, matches placement file)
        page_marker_count = 0

        all_lines = group_chars_into_lines(chars, y_tol=2)

        for line_chars in all_lines:
            line_text = chars_to_text(line_chars)
            if not line_text:
                continue
            if re.search(r"islamicbulletin|IslamicBulletin|www\.", line_text, re.I):
                continue

            sizes = [c.get("size", 0) for c in line_chars if c["text"].strip()]
            if not sizes:
                continue
            dom_size = max(set(sizes), key=sizes.count)

            # ── Footnote content lines (9.5pt) ──────────────────────────────
            if 9.0 <= dom_size <= 10.0 and dom_size < 10.5:
                m = re.match(r"^(\d{1,3})\s+(.+)", line_text)
                if m:
                    num = int(m.group(1))
                    rest = m.group(2)
                    if 0 < num < 1000 and current_surah:
                        commit_fn()
                        fn_state_surah = current_surah
                        fn_state_num   = num
                        fn_state_parts = [rest]
                        continue
                if fn_state_num is not None:
                    fn_state_parts.append(line_text)
                    continue
                continue

            # ── Body text lines (11pt) ───────────────────────────────────────
            if 10.5 <= dom_size <= 11.5:
                commit_fn()

                m = VERSE_RE.match(line_text.strip())
                if m:
                    current_surah = m.group(1)
                    current_ayah  = m.group(2)
                    continue

                # Superscript markers: size ~5pt AND dark-red color (0.502, 0, 0)
                sup_chars_line = [
                    c for c in line_chars
                    if 4.5 <= c.get("size", 0) <= 5.5
                    and c["text"].strip()
                    and is_dark_red(c.get("non_stroking_color"))
                ]

                if not sup_chars_line or not current_surah or not current_ayah:
                    continue

                # Group adjacent sup chars into marker tokens (e.g., "1"+"2" → "12")
                sup_sorted = sorted(sup_chars_line, key=lambda c: c["x0"])
                sup_tokens = []
                if sup_sorted:
                    grp = [sup_sorted[0]]
                    for sc in sup_sorted[1:]:
                        if sc["x0"] - grp[-1]["x1"] < 3 and sc["text"].isdigit():
                            grp.append(sc)
                        else:
                            t = "".join(c["text"] for c in grp)
                            if t.isdigit():
                                sup_tokens.append({
                                    "text": t,
                                    "x0":  grp[0]["x0"],
                                    "x1":  grp[-1]["x1"],
                                    "top": grp[0]["top"],
                                })
                            grp = [sc]
                    t = "".join(c["text"] for c in grp)
                    if t.isdigit():
                        sup_tokens.append({
                            "text": t,
                            "x0":  grp[0]["x0"],
                            "x1":  grp[-1]["x1"],
                            "top": grp[0]["top"],
                        })

                for st in sup_tokens:
                    fn_num = int(st["text"])
                    if fn_num <= 0 or fn_num >= 1000:
                        continue

                    page_marker_count += 1
                    attaches_after = placements.get((page_num, page_marker_count), "")

                    surah_ayah = f"{current_surah}:{current_ayah}"
                    key = (current_surah, fn_num)

                    if fn_num not in verse_footnotes[current_surah][current_ayah]:
                        verse_footnotes[current_surah][current_ayah].append(fn_num)

                    if key not in fn_meta:
                        fn_meta[key] = {
                            "attaches_after": attaches_after,
                            "page":           page_num,
                            "surah_ayah":     surah_ayah,
                        }

    commit_fn()

print(f"  Found {len(fn_texts)} footnote text entries")
print(f"  Found markers in {sum(len(v) for v in verse_footnotes.values())} verses")

# ── Merge texts into meta and write per-surah JSON ───────────────────────────
print("Writing output…")

for key, text in fn_texts.items():
    if key in fn_meta:
        fn_meta[key]["text"] = text
    else:
        fn_meta[key] = {"text": text, "attaches_after": "", "page": 0, "surah_ayah": ""}

all_surahs: set[str] = set(verse_footnotes.keys()) | {k[0] for k in fn_meta}

total_verse_entries = 0
total_fn_texts      = 0

for surah in sorted(all_surahs, key=lambda s: int(s)):
    verses: dict[str, list] = dict(verse_footnotes.get(surah, {}))
    texts: dict[str, dict]  = {}

    for (s, fn_num), meta in fn_meta.items():
        if s == surah:
            texts[str(fn_num)] = meta

    payload = {"verses": verses, "texts": texts}
    total_verse_entries += len(verses)
    total_fn_texts      += len(texts)

    out_path = os.path.join(OUT_DIR, f"{surah}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)

print(f"\nDone!")
print(f"  Surahs with data  : {len(all_surahs)}")
print(f"  Verse entries     : {total_verse_entries}")
print(f"  Footnote texts    : {total_fn_texts}")
