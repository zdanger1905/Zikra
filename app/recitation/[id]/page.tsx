"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WordPos { verseNum: number; wordIdx: number; }

interface Ayah {
  number: number;
  numberInSurah: number;
  text: string;
}

interface SurahEdition {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  numberOfAyahs: number;
  revelationType: string;
  ayahs: Ayah[];
}

interface WordEntry { arabic: string; transliteration: string; }

interface VerseAudio {
  timestampFrom: number;
  timestampTo: number;
  segments: number[][];
}

interface SurahListItem {
  number: number;
  name: string;
  englishName: string;
  numberOfAyahs: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RecitationPage() {
  const params = useParams();
  const id = params.id as string;
  const surahNum = Number(id);

  // Data
  const [surah, setSurah] = useState<SurahEdition | null>(null);
  const [wordData, setWordData] = useState<Record<number, WordEntry[]> | null>(null);
  const [activeTooltip, setActiveTooltip] = useState<{ vn: number; wi: number } | null>(null);
  useEffect(() => {
    if (!activeTooltip) return;
    function onClickOut() { setActiveTooltip(null); }
    document.addEventListener("click", onClickOut);
    return () => document.removeEventListener("click", onClickOut);
  }, [activeTooltip]);
  const [audioData, setAudioData] = useState<Record<string, VerseAudio> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Surah list
  const [surahList, setSurahList] = useState<SurahListItem[]>([]);
  const [listSearch, setListSearch] = useState("");
  const activeSurahRef = useRef<HTMLAnchorElement>(null);

  // Playback
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingVerse, setPlayingVerse] = useState<number | null>(null);
  const [playingWordIdx, setPlayingWordIdx] = useState<number | null>(null);
  const chapterAudioRef = useRef<HTMLAudioElement | null>(null);
  const chapterAudioUrlRef = useRef<string | null>(null);
  const audioDataRef = useRef<Record<string, VerseAudio> | null>(null);
  const isPlayingRef = useRef(false);
  const playingVerseRef = useRef<number | null>(null);
  const numberOfAyahsRef = useRef(0);
  const playingWordElRef = useRef<HTMLElement | null>(null);

  // Loop / cursor
  const [cursorsActive, setCursorsActive] = useState(false);
  const [loopStart, setLoopStart] = useState(1);
  const [loopEnd, setLoopEnd] = useState(3);
  const [repeatCount, setRepeatCount] = useState<number | "infinite">("infinite");
  const [currentRepeat, setCurrentRepeat] = useState(1);
  const loopStartRef = useRef(1);
  const loopEndRef = useRef(3);
  const repeatCountRef = useRef<number | "infinite">("infinite");
  const currentRepeatRef = useRef(1);
  const cursorsActiveRef = useRef(false);
  // Word-level loop times (ms) — null means fall back to verse boundary
  const loopStartTimeRef = useRef<number | null>(null);
  const loopEndTimeRef   = useRef<number | null>(null);

  // Mobile UI state
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const mobileControlsSheetRef = useRef<HTMLDivElement>(null);
  const dragBottomBoundaryRef = useRef<number>(typeof window !== "undefined" ? window.innerHeight : 800);

  // Word-level cursor handles
  const [selStart, setSelStart] = useState<WordPos | null>(null);
  const [selEnd,   setSelEnd]   = useState<WordPos | null>(null);
  const selStartRef = useRef<WordPos | null>(null);
  const selEndRef   = useRef<WordPos | null>(null);
  const [draggingHandle, setDraggingHandle] = useState<"start" | "end" | null>(null);
  const draggingHandleRef = useRef<"start" | "end" | null>(null);
  // Direct DOM refs for handles — no React state for position (avoids re-renders during drag)
  const startHandleRef = useRef<HTMLDivElement | null>(null);
  const endHandleRef   = useRef<HTMLDivElement | null>(null);

  // Keep refs in sync
  useEffect(() => { audioDataRef.current = audioData; }, [audioData]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { playingVerseRef.current = playingVerse; }, [playingVerse]);
  useEffect(() => { numberOfAyahsRef.current = surah?.numberOfAyahs ?? 0; }, [surah]);
  useEffect(() => { loopStartRef.current = loopStart; }, [loopStart]);
  useEffect(() => { loopEndRef.current = loopEnd; }, [loopEnd]);
  useEffect(() => { repeatCountRef.current = repeatCount; }, [repeatCount]);
  useEffect(() => { currentRepeatRef.current = currentRepeat; }, [currentRepeat]);
  useEffect(() => { cursorsActiveRef.current = cursorsActive; }, [cursorsActive]);

  // Apply word highlight to DOM after every state change — avoids className re-render races
  useEffect(() => {
    if (playingWordElRef.current) {
      playingWordElRef.current.dataset.playing = "";
      playingWordElRef.current = null;
    }
    if (playingVerse !== null && playingWordIdx !== null) {
      const el = document.querySelector(`[data-v="${playingVerse}"][data-w="${playingWordIdx}"]`) as HTMLElement | null;
      if (el) { el.dataset.playing = "1"; playingWordElRef.current = el; }
    }
  }, [playingVerse, playingWordIdx]);

  // Unmount: stop audio
  useEffect(() => {
    return () => {
      if (chapterAudioRef.current) {
        chapterAudioRef.current.pause();
        chapterAudioRef.current.ontimeupdate = null;
        chapterAudioRef.current = null;
      }
    };
  }, []);

  // Fetch surah list once
  useEffect(() => {
    fetch("https://api.alquran.cloud/v1/surah")
      .then(r => r.json())
      .then(d => setSurahList(d.data ?? []))
      .catch(() => {});
  }, []);

  // Scroll active surah into view when list loads
  useEffect(() => {
    if (surahList.length && activeSurahRef.current) {
      activeSurahRef.current.scrollIntoView({ block: "center" });
    }
  }, [surahList]);

  // Fetch surah data
  useEffect(() => {
    if (chapterAudioRef.current) {
      chapterAudioRef.current.pause();
      chapterAudioRef.current.ontimeupdate = null;
      chapterAudioRef.current = null;
    }
    chapterAudioUrlRef.current = null;
    audioDataRef.current = null;
    setIsPlaying(false);
    isPlayingRef.current = false;
    setPlayingVerse(null);
    playingVerseRef.current = null;
    setPlayingWordIdx(null);
    setLoading(true);
    setError(false);
    setSurah(null);
    setWordData(null);
    setAudioData(null);
    setCursorsActive(false);
    cursorsActiveRef.current = false;

    Promise.all([
      fetch(`https://api.alquran.cloud/v1/surah/${id}/editions/quran-uthmani`).then(r => r.json()),
      fetch(`https://api.quran.com/api/v4/verses/by_chapter/${id}?words=true&word_fields=text_uthmani,transliteration&per_page=300`)
        .then(r => r.json()).catch(() => null),
      fetch(`https://api.qurancdn.com/api/qdc/audio/reciters/7/audio_files?chapter_number=${id}&segments=true`)
        .then(r => r.json()).catch(() => null),
    ]).then(([quranData, wordApiData, recitationData]) => {
      if (quranData.code !== 200 || !quranData.data?.[0]) { setError(true); setLoading(false); return; }

      const s = quranData.data[0] as SurahEdition;
      setSurah(s);
      numberOfAyahsRef.current = s.numberOfAyahs;

      // Word data
      if (wordApiData?.verses) {
        const wMap: Record<number, WordEntry[]> = {};
        for (const v of wordApiData.verses) {
          const vNum = v.verse_number ?? Number(v.verse_key?.split(":")[1]);
          if (!vNum) continue;
          wMap[Number(vNum)] = (v.words ?? [])
            .filter((w: any) => w.char_type_name !== "end")
            .map((w: any) => ({ arabic: w.text_uthmani ?? w.text ?? "", transliteration: w.transliteration?.text ?? "" }));
        }
        setWordData(wMap);
      }

      // Audio data
      if (recitationData?.audio_files?.[0]) {
        const af = recitationData.audio_files[0];
        if (af.verse_timings) {
          const aMap: Record<string, VerseAudio> = {};
          for (const vt of af.verse_timings) {
            const key = String(vt.verse_key).split(":")[1];
            aMap[key] = { timestampFrom: vt.timestamp_from, timestampTo: vt.timestamp_to, segments: vt.segments ?? [] };
          }
          setAudioData(aMap);
          audioDataRef.current = aMap;
        }
        const rawUrl = af.audio_url ?? "";
        chapterAudioUrlRef.current = rawUrl.startsWith("http") ? rawUrl : `https://verses.quran.com/${rawUrl}`;
      }

      setLoading(false);
    }).catch(() => { setError(true); setLoading(false); });
  }, [id]);

  // ─── Audio helpers ──────────────────────────────────────────────────────────

  function getOrCreateAudio(): HTMLAudioElement | null {
    if (!chapterAudioUrlRef.current) return null;
    if (chapterAudioRef.current) return chapterAudioRef.current;

    const audio = new Audio(chapterAudioUrlRef.current);
    chapterAudioRef.current = audio;

    audio.ontimeupdate = () => {
      const nowMs = audio.currentTime * 1000;
      const curVerse = playingVerseRef.current;
      if (curVerse === null) return;
      const aData = audioDataRef.current;
      const curAudio = aData?.[String(curVerse)];
      if (!curAudio) return;

      // Word highlighting
      let wi: number | null = null;
      for (let i = 0; i < curAudio.segments.length; i++) {
        const [, s, e] = curAudio.segments[i];
        if (nowMs >= s && nowMs < e) { wi = i; break; }
      }
      setPlayingWordIdx(wi);

      // Word-level loop end check (takes priority over verse advancement)
      const active = cursorsActiveRef.current;
      const loopEndMs = loopEndTimeRef.current;
      if (active && loopEndMs !== null && nowMs >= loopEndMs) {
        const rc = repeatCountRef.current;
        const cr = currentRepeatRef.current;
        if (rc === "infinite" || cr < (rc as number)) {
          currentRepeatRef.current = cr + 1;
          setCurrentRepeat(cr + 1);
          const startMs = loopStartTimeRef.current;
          const sv = selStartRef.current?.verseNum ?? loopStartRef.current;
          audio.currentTime = startMs !== null ? startMs / 1000 : (aData?.[String(sv)]?.timestampFrom ?? 0) / 1000;
          playingVerseRef.current = sv;
          setPlayingVerse(sv);
        } else {
          audio.pause();
          isPlayingRef.current = false;
          setIsPlaying(false);
          setPlayingVerse(null);
          playingVerseRef.current = null;
          setPlayingWordIdx(null);
        }
        return;
      }

      // Verse ended — advance tracking to next verse (no seek; audio is continuous)
      if (nowMs >= curAudio.timestampTo) {
        const next = curVerse + 1;
        if (next <= numberOfAyahsRef.current) {
          playingVerseRef.current = next;
          setPlayingVerse(next);
        } else {
          audio.pause();
          isPlayingRef.current = false;
          setIsPlaying(false);
          setPlayingVerse(null);
          playingVerseRef.current = null;
          setPlayingWordIdx(null);
        }
      }
    };

    return audio;
  }

  function playVerse(verseNum: number) {
    const aData = audioDataRef.current;
    if (!aData) return;
    const vAudio = aData[String(verseNum)];
    if (!vAudio) return;
    const audio = getOrCreateAudio();
    if (!audio) return;

    audio.currentTime = vAudio.timestampFrom / 1000;
    audio.play().catch(() => {});
    isPlayingRef.current = true;
    setIsPlaying(true);
    playingVerseRef.current = verseNum;
    setPlayingVerse(verseNum);
    setPlayingWordIdx(null);
    currentRepeatRef.current = 1;
    setCurrentRepeat(1);
  }

  function togglePlay() {
    if (isPlaying) {
      chapterAudioRef.current?.pause();
      isPlayingRef.current = false;
      setIsPlaying(false);
    } else {
      if (chapterAudioRef.current && playingVerse !== null) {
        chapterAudioRef.current.play().catch(() => {});
        isPlayingRef.current = true;
        setIsPlaying(true);
      } else {
        if (cursorsActive && selStartRef.current) {
          playVerse(selStartRef.current.verseNum);
          // Seek to exact word start after playVerse sets currentTime to verse start
          if (loopStartTimeRef.current !== null && chapterAudioRef.current)
            chapterAudioRef.current.currentTime = loopStartTimeRef.current / 1000;
        } else {
          playVerse(1);
        }
      }
    }
  }

  function skipVerse(delta: number) {
    const cur = playingVerse ?? 1;
    if (delta === -1) {
      if (cursorsActiveRef.current) {
        // In cursor mode: always jump back to cursor start
        const startVerse = selStartRef.current?.verseNum ?? cur;
        playVerse(startVerse);
        if (chapterAudioRef.current && loopStartTimeRef.current !== null) {
          chapterAudioRef.current.currentTime = loopStartTimeRef.current / 1000;
        }
        return;
      }
      if (chapterAudioRef.current && audioDataRef.current) {
        const verseStart = (audioDataRef.current[String(cur)]?.timestampFrom ?? 0) / 1000;
        const isAtStart = chapterAudioRef.current.currentTime - verseStart < 2;
        if (!isAtStart) { playVerse(cur); return; }
      }
    }
    const minVerse = cursorsActiveRef.current ? (selStartRef.current?.verseNum ?? 1) : 1;
    const maxVerse = cursorsActiveRef.current ? (selEndRef.current?.verseNum ?? surah?.numberOfAyahs ?? 1) : (surah?.numberOfAyahs ?? 1);
    const next = Math.max(minVerse, Math.min(maxVerse, cur + delta));
    playVerse(next);
  }

  // Scroll playing verse into view
  useEffect(() => {
    if (playingVerse !== null) {
      document.querySelector(`[data-v="${playingVerse}"][data-w="0"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [playingVerse]);

  // ─── Cursor handle helpers ──────────────────────────────────────────────────

  function getWordAtPoint(x: number, y: number): WordPos | null {
    for (const el of document.elementsFromPoint(x, y)) {
      const d = (el as HTMLElement).dataset;
      if (d.v !== undefined && d.w !== undefined)
        return { verseNum: Number(d.v), wordIdx: Number(d.w) };
    }
    return null;
  }

  function cmpWord(a: WordPos, b: WordPos) {
    return a.verseNum !== b.verseNum ? a.verseNum - b.verseNum : a.wordIdx - b.wordIdx;
  }

  function isWordInRange(vn: number, wi: number): boolean {
    if (!selStart || !selEnd || !cursorsActive) return false;
    if (vn < selStart.verseNum || vn > selEnd.verseNum) return false;
    if (vn === selStart.verseNum && wi < selStart.wordIdx) return false;
    if (vn === selEnd.verseNum   && wi > selEnd.wordIdx)   return false;
    return true;
  }

  // Compute exact ms timestamps for the loop from word-level segment data
  function computeLoopTimes() {
    const aData = audioDataRef.current;
    const ss = selStartRef.current;
    const se = selEndRef.current;
    if (!aData || !ss || !se) return;
    const startAudio = aData[String(ss.verseNum)];
    const endAudio   = aData[String(se.verseNum)];
    loopStartTimeRef.current = startAudio?.segments?.[ss.wordIdx]?.[1] ?? startAudio?.timestampFrom ?? null;
    loopEndTimeRef.current   = endAudio?.segments?.[se.wordIdx]?.[2]   ?? endAudio?.timestampTo   ?? null;
  }

  // Place a handle circle over a specific word (direct DOM, no React re-render)
  function placeHandle(ref: React.RefObject<HTMLDivElement | null>, wp: WordPos, side: "start" | "end") {
    const wordEl = document.querySelector(`[data-v="${wp.verseNum}"][data-w="${wp.wordIdx}"]`);
    if (!wordEl || !ref.current) return;
    const r = wordEl.getBoundingClientRect();
    const handleTop = r.top + r.height / 2 - 12;
    const safeTop = 48; // navbar height
    const safeBottom = dragBottomBoundaryRef.current - 12;
    if (handleTop < safeTop || handleTop > safeBottom) {
      ref.current.style.visibility = "hidden";
      return;
    }
    const x = side === "start" ? r.right : r.left;
    ref.current.style.left = (x - 12) + "px";
    ref.current.style.top  = handleTop + "px";
    ref.current.style.visibility = "visible";
  }

  // Sync handle positions when React state changes (outside of drag)
  useEffect(() => {
    if (!selStart || !cursorsActive || draggingHandle === "start") return;
    placeHandle(startHandleRef, selStart, "start");
  }, [selStart, cursorsActive, draggingHandle]);

  useEffect(() => {
    if (!selEnd || !cursorsActive || draggingHandle === "end") return;
    placeHandle(endHandleRef, selEnd, "end");
  }, [selEnd, cursorsActive, draggingHandle]);

  // Hide handles when cursors deactivated
  useEffect(() => {
    if (!cursorsActive) {
      if (startHandleRef.current) startHandleRef.current.style.visibility = "hidden";
      if (endHandleRef.current)   endHandleRef.current.style.visibility   = "hidden";
    }
  }, [cursorsActive]);

  // Keep drag bottom boundary in sync with controls sheet
  useEffect(() => {
    function update() {
      if (mobileControlsSheetRef.current) {
        dragBottomBoundaryRef.current = mobileControlsSheetRef.current.getBoundingClientRect().top;
      } else {
        dragBottomBoundaryRef.current = window.innerHeight;
      }
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [mobileControlsOpen]);

  // Re-position handles on scroll
  useEffect(() => {
    if (!cursorsActive) return;
    function onScroll() {
      if (selStartRef.current && draggingHandleRef.current !== "start")
        placeHandle(startHandleRef, selStartRef.current, "start");
      if (selEndRef.current && draggingHandleRef.current !== "end")
        placeHandle(endHandleRef, selEndRef.current, "end");
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [cursorsActive]);

  // ── Direct-DOM word highlight helpers (used during drag) ───────────────────

  function setWordHighlight(vn: number, wi: number, on: boolean) {
    const el = document.querySelector(`[data-v="${vn}"][data-w="${wi}"]`) as HTMLElement | null;
    if (el) el.dataset.inSel = on ? "1" : "";
  }

  function applyRangeHighlights(start: WordPos, end: WordPos, prevStart: WordPos | null, prevEnd: WordPos | null) {
    // Clear previous range
    if (prevStart && prevEnd) {
      for (let vn = prevStart.verseNum; vn <= prevEnd.verseNum; vn++) {
        document.querySelectorAll(`[data-v="${vn}"][data-w]`).forEach(el => {
          (el as HTMLElement).dataset.inSel = "";
        });
      }
    }
    // Apply new range
    for (let vn = start.verseNum; vn <= end.verseNum; vn++) {
      document.querySelectorAll(`[data-v="${vn}"][data-w]`).forEach(el => {
        const wi = Number((el as HTMLElement).dataset.w);
        const inRange =
          (vn > start.verseNum || wi >= start.wordIdx) &&
          (vn < end.verseNum   || wi <= end.wordIdx);
        (el as HTMLElement).dataset.inSel = inRange ? "1" : "";
      });
    }
  }

  // ── Drag — all direct DOM, no setState during move ─────────────────────────
  useEffect(() => {
    if (!draggingHandle) return;

    let prevStart = selStartRef.current;
    let prevEnd   = selEndRef.current;

    // Edge-scroll state
    const pointerPos = { x: 0, y: window.innerHeight / 2 };
    let hasMoved = false;
    let rafId: number | null = null;
    const EDGE_ZONE = 80; // px from top/bottom edge that triggers scroll
    const MAX_SPEED = 12; // px per frame at the very edge

    function updateWordAtPointer() {
      const hRef = draggingHandle === "start" ? startHandleRef : endHandleRef;
      const handleEl = hRef.current;
      if (handleEl) handleEl.style.pointerEvents = "none";
      const clampedY = Math.max(60, Math.min(pointerPos.y, dragBottomBoundaryRef.current - 20));
      const word = getWordAtPoint(pointerPos.x, clampedY);
      if (handleEl) handleEl.style.pointerEvents = "";
      if (!word) return;
      if (draggingHandle === "start") {
        const end = selEndRef.current;
        if (!end || cmpWord(word, end) <= 0) {
          if (!selStartRef.current || cmpWord(word, selStartRef.current) !== 0) {
            const prev = selStartRef.current;
            selStartRef.current = word;
            loopStartRef.current = word.verseNum;
            if (selEndRef.current) applyRangeHighlights(word, selEndRef.current, prev, selEndRef.current);
            placeHandle(hRef, word, "start");
          }
        }
      } else {
        const start = selStartRef.current;
        if (!start || cmpWord(word, start) >= 0) {
          if (!selEndRef.current || cmpWord(word, selEndRef.current) !== 0) {
            const prev = selEndRef.current;
            selEndRef.current = word;
            loopEndRef.current = word.verseNum;
            if (selStartRef.current) applyRangeHighlights(selStartRef.current, word, selStartRef.current, prev);
            placeHandle(hRef, word, "end");
          }
        }
      }
    }

    function edgeScroll() {
      if (hasMoved) {
        const effectiveBottom = dragBottomBoundaryRef.current;
        const distBottom = effectiveBottom - pointerPos.y;
        const distTop = pointerPos.y;
        let speed = 0;
        if (distBottom < EDGE_ZONE) speed = MAX_SPEED * (1 - distBottom / EDGE_ZONE);
        else if (distTop < EDGE_ZONE) speed = -MAX_SPEED * (1 - distTop / EDGE_ZONE);
        if (speed !== 0) {
          window.scrollBy(0, speed);
          updateWordAtPointer();
        }
      }
      rafId = requestAnimationFrame(edgeScroll);
    }

    rafId = requestAnimationFrame(edgeScroll);

    function onMove(e: MouseEvent | TouchEvent) {
      if ("touches" in e) e.preventDefault();
      const hRef = draggingHandle === "start" ? startHandleRef : endHandleRef;
      const clientX = "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      pointerPos.x = clientX;
      pointerPos.y = clientY;
      hasMoved = true;

      // Temporarily hide the dragging handle so elementsFromPoint can find the word underneath
      const handleEl = hRef.current;
      if (handleEl) handleEl.style.pointerEvents = "none";
      const word = getWordAtPoint(clientX, clientY);
      if (handleEl) handleEl.style.pointerEvents = "";
      if (!word) return;

      let changed = false;
      if (draggingHandle === "start") {
        const end = selEndRef.current;
        if (!end || cmpWord(word, end) <= 0) {
          if (!selStartRef.current || cmpWord(word, selStartRef.current) !== 0) {
            prevStart = selStartRef.current;
            selStartRef.current = word;
            loopStartRef.current = word.verseNum;
            changed = true;
          }
        }
      } else {
        const start = selStartRef.current;
        if (!start || cmpWord(word, start) >= 0) {
          if (!selEndRef.current || cmpWord(word, selEndRef.current) !== 0) {
            prevEnd = selEndRef.current;
            selEndRef.current = word;
            loopEndRef.current = word.verseNum;
            changed = true;
          }
        }
      }

      if (changed && selStartRef.current && selEndRef.current) {
        applyRangeHighlights(selStartRef.current, selEndRef.current, prevStart, prevEnd);
        prevStart = selStartRef.current;
        prevEnd   = selEndRef.current;
        // Snap handle to the word it just landed on
        if (draggingHandle) placeHandle(hRef, draggingHandle === "start" ? selStartRef.current : selEndRef.current, draggingHandle);
      }
    }

    function onUp() {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      draggingHandleRef.current = null;
      setDraggingHandle(null);
      // Sync React state once — triggers one re-render to own the highlights
      setSelStart(selStartRef.current);
      setSelEnd(selEndRef.current);
      if (selStartRef.current) { setLoopStart(selStartRef.current.verseNum); loopStartRef.current = selStartRef.current.verseNum; }
      if (selEndRef.current)   { setLoopEnd(selEndRef.current.verseNum);     loopEndRef.current   = selEndRef.current.verseNum; }
      computeLoopTimes();
      // Snap handles to final word positions
      if (selStartRef.current) placeHandle(startHandleRef, selStartRef.current, "start");
      if (selEndRef.current)   placeHandle(endHandleRef,   selEndRef.current,   "end");
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
    document.addEventListener("touchmove",  onMove as EventListener, { passive: false });
    document.addEventListener("touchend",   onUp);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
      document.removeEventListener("touchmove",  onMove as EventListener);
      document.removeEventListener("touchend",   onUp);
    };
  }, [draggingHandle]);

  // ─── Cursors toggle ─────────────────────────────────────────────────────────

  function toggleCursors() {
    if (cursorsActive) {
      setCursorsActive(false); cursorsActiveRef.current = false;
      setSelStart(null); selStartRef.current = null;
      setSelEnd(null);   selEndRef.current = null;
      loopStartTimeRef.current = null; loopEndTimeRef.current = null;
      document.querySelectorAll("[data-in-sel]").forEach(el => {
        (el as HTMLElement).dataset.inSel = "";
      });
    } else {
      if (chapterAudioRef.current) {
        chapterAudioRef.current.pause();
        chapterAudioRef.current.ontimeupdate = null;
        chapterAudioRef.current = null;
      }
      isPlayingRef.current = false;
      setIsPlaying(false);
      setPlayingVerse(null);
      playingVerseRef.current = null;
      setPlayingWordIdx(null);

      const midY = window.innerHeight / 2;
      const allWordEls = Array.from(document.querySelectorAll<HTMLElement>("[data-v][data-w]"))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.bottom > 0 && r.top < window.innerHeight;
        })
        .sort((a, b) => {
          const ra = a.getBoundingClientRect();
          const rb = b.getBoundingClientRect();
          return Math.abs((ra.top + ra.bottom) / 2 - midY) - Math.abs((rb.top + rb.bottom) / 2 - midY);
        });
      const midEl   = allWordEls[0];
      const startEl = allWordEls.find((el) => {
        const r = el.getBoundingClientRect();
        return (r.top + r.bottom) / 2 <= midY;
      }) ?? midEl;
      const endEl = allWordEls.find((el) => {
        const r = el.getBoundingClientRect();
        return (r.top + r.bottom) / 2 >= midY;
      }) ?? midEl;
      const fallbackV = playingVerse ?? 1;
      const ss: WordPos = startEl
        ? { verseNum: Number(startEl.dataset.v), wordIdx: Math.max(0, Number(startEl.dataset.w) - 1) }
        : { verseNum: fallbackV, wordIdx: 0 };
      const se: WordPos = endEl
        ? { verseNum: Number(endEl.dataset.v), wordIdx: Number(endEl.dataset.w) + 1 }
        : { verseNum: Math.min(fallbackV + 1, surah!.numberOfAyahs), wordIdx: 0 };
      const sv = ss.verseNum;
      const ev = se.verseNum;
      setSelStart(ss); selStartRef.current = ss;
      setSelEnd(se);   selEndRef.current = se;
      setLoopStart(sv); loopStartRef.current = sv;
      setLoopEnd(ev);   loopEndRef.current = ev;
      setRepeatCount("infinite"); repeatCountRef.current = "infinite";
      setCurrentRepeat(1); currentRepeatRef.current = 1;
      setCursorsActive(true); cursorsActiveRef.current = true;
      computeLoopTimes();
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const showBismillah = surahNum !== 1 && surahNum !== 9;

  function stripBismillah(text: string): string {
    return text
      .replace(/^بِسْمِ\s+ٱللَّهِ\s+ٱلرَّحْمَٰنِ\s+ٱلرَّحِيمِ\s*/, "")
      .replace(/^بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ\s*/, "")
      .trim();
  }

  const filteredSurahs = surahList.filter(s =>
    s.englishName.toLowerCase().includes(listSearch.toLowerCase()) ||
    s.name.includes(listSearch) ||
    s.number.toString().includes(listSearch)
  );

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#3d3d3d] flex">

      {/* ── Left: Surah list ── */}
      <div className="hidden md:flex fixed left-0 top-12 bottom-0 w-64 bg-[#252525] border-r border-[#333] flex-col z-30">
        <div className="p-3 border-b border-[#333] shrink-0">
          <input
            type="text"
            placeholder="Search surahs..."
            value={listSearch}
            onChange={e => setListSearch(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-[#333] border border-[#484848] text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-gray-500 placeholder:text-gray-500"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredSurahs.map(s => (
            <Link
              key={s.number}
              href={`/recitation/${s.number}`}
              ref={s.number === surahNum ? activeSurahRef : undefined}
              className={`flex items-center gap-2 px-3 py-2.5 border-b border-[#2e2e2e] transition-colors ${
                s.number === surahNum
                  ? "bg-[#3d3d3d] text-white"
                  : "text-gray-400 hover:bg-[#2e2e2e] hover:text-gray-200"
              }`}
            >
              <span className="text-xs text-gray-600 w-5 text-right shrink-0 tabular-nums">{s.number}</span>
              <span className="text-sm flex-1 truncate">{s.englishName}</span>
              <span className="arabic text-sm text-gray-500 shrink-0">{s.name}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Center: Arabic text ── */}
      <div className="md:ml-64 md:mr-56 min-h-screen pt-14 pb-28 px-4 md:px-14">
        {loading && (
          <div className="flex items-center justify-center h-[60vh]">
            <div className="w-10 h-10 border-4 border-gray-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {error && !loading && (
          <div className="flex items-center justify-center h-[60vh]">
            <p className="text-red-400">Failed to load surah.</p>
          </div>
        )}

        {surah && !loading && (
          <>
            {/* Header */}
            <div className="text-center mb-10 mt-2">
              <p className="arabic text-5xl text-white leading-loose mb-2">{surah.name}</p>
              <h1 className="text-2xl font-bold text-gray-200 mb-1">{surah.englishName}</h1>
              <p className="text-sm text-gray-500">{surah.englishNameTranslation} · {surah.numberOfAyahs} verses</p>
            </div>

            {/* Bismillah header */}
            {showBismillah && (
              <div className="text-center mb-8">
                <p className="arabic text-3xl text-gray-200 leading-loose">
                  بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
                </p>
                <p className="text-sm mt-1 italic text-gray-500">
                  In the name of Allah, the Most Gracious, the Most Merciful
                </p>
              </div>
            )}

            {/* Continuous Arabic text */}
            <div
              className="arabic text-center"
              dir="rtl"
              style={{ fontSize: "2.2em", lineHeight: "2.6" }}
              onClick={(e) => { if ((e.target as HTMLElement).dataset.w === undefined) setActiveTooltip(null); }}
            >

              {surah.ayahs.map((ayah, i) => {
                const vn = ayah.numberInSurah;
                const rawText = showBismillah && i === 0 ? stripBismillah(ayah.text) : ayah.text;
                const words = wordData?.[vn] ?? null;

                return (
                  <span key={vn}>
                    {/* Words — data-playing set via useEffect; data-in-sel drives cursor highlight */}
                    {words && words.length > 0 ? (
                      words.map((w, wi) => (
                        <span
                          key={wi}
                          data-v={vn}
                          data-w={wi}
                          data-in-sel={isWordInRange(vn, wi) ? "1" : undefined}
                          className="recitation-word hover:text-[#6b9fff] relative"
                          onClick={() => setActiveTooltip(
                            activeTooltip?.vn === vn && activeTooltip?.wi === wi ? null : { vn, wi }
                          )}
                        >
                          {activeTooltip?.vn === vn && activeTooltip?.wi === wi && w.transliteration && (
                            <span
                              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 rounded-md bg-[#1a1a1a] border border-[#444] text-[#6b9fff] text-xs font-sans whitespace-nowrap pointer-events-none"
                              style={{ fontSize: "0.35em", letterSpacing: "0.02em" }}
                            >
                              {w.transliteration}
                            </span>
                          )}
                          {w.arabic}{" "}
                        </span>
                      ))
                    ) : (
                      <span data-v={vn} data-w={0} className="recitation-word hover:text-[#6b9fff]">{rawText}{" "}</span>
                    )}

                    {/* Verse end marker */}
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.38em",
                        width: "2em",
                        height: "2em",
                        borderRadius: "50%",
                        verticalAlign: "middle",
                        margin: "0 0.3em",
                        userSelect: "none",
                        background: "rgba(255,255,255,0.08)",
                        color: "rgb(107,114,128)",
                        fontFamily: "sans-serif",
                      }}
                    >
                      {vn}
                    </span>
                  </span>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Cursor handles — always in DOM, positioned via direct DOM refs ── */}
      <div
        ref={startHandleRef}
        onMouseDown={e => { e.preventDefault(); draggingHandleRef.current = "start"; setDraggingHandle("start"); }}
        onTouchStart={e => { e.preventDefault(); draggingHandleRef.current = "start"; setDraggingHandle("start"); }}
        style={{
          position: "fixed", visibility: "hidden",
          width: 24, height: 24, borderRadius: "50%",
          background: "#22c55e", border: "2px solid rgba(255,255,255,0.7)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.6)",
          zIndex: 60, cursor: "grab", userSelect: "none", touchAction: "none",
        }}
      />
      <div
        ref={endHandleRef}
        onMouseDown={e => { e.preventDefault(); draggingHandleRef.current = "end"; setDraggingHandle("end"); }}
        onTouchStart={e => { e.preventDefault(); draggingHandleRef.current = "end"; setDraggingHandle("end"); }}
        style={{
          position: "fixed", visibility: "hidden",
          width: 24, height: 24, borderRadius: "50%",
          background: "#ef4444", border: "2px solid rgba(255,255,255,0.7)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.6)",
          zIndex: 60, cursor: "grab", userSelect: "none", touchAction: "none",
        }}
      />

      {/* ── Mobile: Surah drawer ── */}
      {mobileDrawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col bg-[#1e1e1e]">
          <div className="flex items-center gap-3 p-3 border-b border-[#333] shrink-0">
            <button onClick={() => setMobileDrawerOpen(false)} className="text-gray-400 hover:text-white p-1">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
              </svg>
            </button>
            <input
              type="text"
              placeholder="Search surahs..."
              value={listSearch}
              onChange={e => setListSearch(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-[#333] border border-[#484848] text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-gray-500 placeholder:text-gray-500"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredSurahs.map(s => (
              <Link
                key={s.number}
                href={`/recitation/${s.number}`}
                ref={s.number === surahNum ? activeSurahRef : undefined}
                onClick={() => setMobileDrawerOpen(false)}
                className={`flex items-center gap-2 px-4 py-3 border-b border-[#2e2e2e] transition-colors ${
                  s.number === surahNum
                    ? "bg-[#3d3d3d] text-white"
                    : "text-gray-400 hover:bg-[#2e2e2e] hover:text-gray-200"
                }`}
              >
                <span className="text-xs text-gray-600 w-6 text-right shrink-0 tabular-nums">{s.number}</span>
                <span className="text-sm flex-1">{s.englishName}</span>
                <span className="arabic text-sm text-gray-500 shrink-0">{s.name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Mobile: Controls sheet ── */}
      {mobileControlsOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setMobileControlsOpen(false)}>
          <div
            ref={mobileControlsSheetRef}
            className="bg-[#252525] rounded-t-2xl border-t border-[#333] px-5 pt-3 pb-8 space-y-3"
            onClick={e => e.stopPropagation()}
          >
            {/* Header row */}
            <div className="flex justify-end mb-1">
              <button onClick={() => setMobileControlsOpen(false)} className="text-gray-400 hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {surah && (
              <>
                <div className="text-center">
                  <p className="arabic text-2xl text-white mb-0.5">{surah.name}</p>
                  <p className="text-xs text-gray-500">{surah.englishName}</p>
                  {playingVerse !== null && (
                    <p className="text-xs text-gray-500 mt-1">
                      Ayah <span className="text-gray-300 font-semibold">{playingVerse}</span> / {surah.numberOfAyahs}
                    </p>
                  )}
                </div>

                {/* Cursors toggle */}
                <button
                  onClick={toggleCursors}
                  className={`w-full py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    cursorsActive
                      ? "bg-green-800 text-white hover:bg-green-700"
                      : "bg-[#323232] text-gray-300 hover:bg-[#3d3d3d] hover:text-white border border-[#484848]"
                  }`}
                >
                  Cursors
                </button>

                {/* Loop options */}
                {cursorsActive && (
                  <div className="space-y-4 border-t border-[#333] pt-4">
                    <div className="flex justify-center gap-1 text-xs text-center leading-snug">
                      <span className="text-green-400 font-semibold">
                        {selStart ? `${surahNum}:${selStart.verseNum}` : "—"}
                      </span>
                      <span className="text-gray-600">→</span>
                      <span className="text-red-400 font-semibold">
                        {selEnd ? `${surahNum}:${selEnd.verseNum}` : "—"}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 uppercase tracking-widest text-center mb-2">Repeat</p>
                      <div className="grid grid-cols-4 gap-2">
                        {([1, 3, 5, "∞"] as const).map(v => {
                          const val = v === "∞" ? "infinite" : (v as number);
                          return (
                            <button
                              key={v}
                              onClick={() => { setRepeatCount(val); repeatCountRef.current = val; currentRepeatRef.current = 1; setCurrentRepeat(1); }}
                              className={`py-2 rounded-xl text-sm font-medium transition-colors ${
                                repeatCount === val
                                  ? "bg-[#4a4a4a] text-white"
                                  : "bg-[#2d2d2d] text-gray-400 hover:bg-[#383838] hover:text-white"
                              }`}
                            >
                              {v}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {repeatCount !== 1 && isPlaying && (
                      <p className="text-xs text-gray-600 text-center">
                        Rep <span className="text-gray-400 font-medium">{currentRepeat}</span>
                        {repeatCount !== "infinite" && <> / {repeatCount}</>}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Mobile: Bottom playback bar ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#1e1e1e] border-t border-[#333]">
        <div className="flex items-center justify-between px-4 py-2">
          {/* Surahs button */}
          <button
            onClick={() => setMobileDrawerOpen(true)}
            className="flex flex-col items-center gap-0.5 text-gray-400 hover:text-white transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M3 6.75A.75.75 0 0 1 3.75 6h16.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 6.75ZM3 12a.75.75 0 0 1 .75-.75h16.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 12Zm0 5.25a.75.75 0 0 1 .75-.75h16.5a.75.75 0 0 1 0 1.5H3.75a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
            </svg>
            <span className="text-[10px]">Surahs</span>
          </button>

          {/* Skip back */}
          <button
            onClick={() => skipVerse(-1)}
            disabled={!audioData}
            className="text-gray-400 hover:text-white disabled:opacity-30 transition-colors p-2"
          >
            <SkipBackIcon className="w-6 h-6" />
          </button>

          {/* Play/pause */}
          <button
            onClick={togglePlay}
            disabled={!audioData}
            className="w-14 h-14 rounded-full bg-[#3a3a3a] hover:bg-[#4a4a4a] border border-[#555] hover:border-[#777] disabled:opacity-30 flex items-center justify-center text-white transition-all shadow-lg"
          >
            {isPlaying
              ? <PauseIcon className="w-6 h-6" />
              : <PlayIcon className="w-6 h-6 ml-1" />
            }
          </button>

          {/* Skip forward */}
          <button
            onClick={() => skipVerse(1)}
            disabled={!audioData}
            className="text-gray-400 hover:text-white disabled:opacity-30 transition-colors p-2"
          >
            <SkipForwardIcon className="w-6 h-6" />
          </button>

          {/* Controls button */}
          <button
            onClick={() => setMobileControlsOpen(true)}
            className={`flex flex-col items-center gap-0.5 transition-colors ${cursorsActive ? "text-green-400" : "text-gray-400 hover:text-white"}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M18.75 12.75h1.5a.75.75 0 0 0 0-1.5h-1.5a.75.75 0 0 0 0 1.5ZM12 6a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5A.75.75 0 0 1 12 6ZM12 18a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5A.75.75 0 0 1 12 18ZM3.75 6.75h1.5a.75.75 0 1 0 0-1.5h-1.5a.75.75 0 0 0 0 1.5ZM5.25 18.75h-1.5a.75.75 0 0 1 0-1.5h1.5a.75.75 0 0 1 0 1.5ZM3 12a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5A.75.75 0 0 1 3 12ZM9 3.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5ZM12.75 12a2.25 2.25 0 1 1 4.5 0 2.25 2.25 0 0 1-4.5 0ZM9 15.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z" />
            </svg>
            <span className="text-[10px]">{cursorsActive ? "Loop On" : "Controls"}</span>
          </button>
        </div>
      </div>

      {/* ── Right: Player panel ── */}
      <div className="hidden md:flex fixed right-0 top-12 bottom-0 w-56 bg-[#252525] border-l border-[#333] flex-col items-center pt-8 pb-6 px-5 gap-5 z-30 overflow-y-auto">

        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-7 h-7 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {surah && !loading && (
          <>
            {/* Surah info */}
            <div className="text-center">
              <p className="arabic text-2xl text-white mb-0.5">{surah.name}</p>
              <p className="text-xs text-gray-500 tracking-wide">{surah.englishName}</p>
            </div>

            {/* Verse indicator */}
            <p className="text-xs text-gray-500 h-4">
              {playingVerse !== null
                ? <>Ayah <span className="text-gray-300 font-semibold">{playingVerse}</span> / {surah.numberOfAyahs}</>
                : null
              }
            </p>

            {/* Play controls */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => skipVerse(-1)}
                disabled={!audioData}
                className="text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
                title="Previous ayah"
              >
                <SkipBackIcon className="w-5 h-5" />
              </button>

              <button
                onClick={togglePlay}
                disabled={!audioData}
                className="w-14 h-14 rounded-full bg-[#3a3a3a] hover:bg-[#4a4a4a] border border-[#555] hover:border-[#777] disabled:opacity-30 flex items-center justify-center text-white transition-all shadow-lg"
              >
                {isPlaying
                  ? <PauseIcon className="w-6 h-6" />
                  : <PlayIcon className="w-6 h-6 ml-1" />
                }
              </button>

              <button
                onClick={() => skipVerse(1)}
                disabled={!audioData}
                className="text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
                title="Next ayah"
              >
                <SkipForwardIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Cursors toggle */}
            <button
              onClick={toggleCursors}
              className={`w-full py-2.5 rounded-xl text-sm font-medium transition-colors ${
                cursorsActive
                  ? "bg-green-800 text-white hover:bg-green-700"
                  : "bg-[#323232] text-gray-300 hover:bg-[#3d3d3d] hover:text-white border border-[#484848]"
              }`}
            >
              Cursors
            </button>

            {/* Loop options */}
            {cursorsActive && (
              <div className="w-full space-y-4 border-t border-[#333] pt-4">
                <div className="flex justify-center gap-1 text-xs text-center leading-snug">
                  <span className="text-green-400 font-semibold">
                    {selStart ? `${surahNum}:${selStart.verseNum}` : "—"}
                  </span>
                  <span className="text-gray-600">→</span>
                  <span className="text-red-400 font-semibold">
                    {selEnd ? `${surahNum}:${selEnd.verseNum}` : "—"}
                  </span>
                </div>

                <div>
                  <p className="text-xs text-gray-600 uppercase tracking-widest text-center mb-2">Repeat</p>
                  <div className="grid grid-cols-4 gap-1">
                    {([1, 3, 5, "∞"] as const).map(v => {
                      const val = v === "∞" ? "infinite" : (v as number);
                      return (
                        <button
                          key={v}
                          onClick={() => { setRepeatCount(val); repeatCountRef.current = val; currentRepeatRef.current = 1; setCurrentRepeat(1); }}
                          className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            repeatCount === val
                              ? "bg-[#4a4a4a] text-white"
                              : "bg-[#2d2d2d] text-gray-400 hover:bg-[#383838] hover:text-white"
                          }`}
                        >
                          {v}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {repeatCount !== 1 && isPlaying && (
                  <p className="text-xs text-gray-600 text-center">
                    Rep{" "}
                    <span className="text-gray-400 font-medium">{currentRepeat}</span>
                    {repeatCount !== "infinite" && <> / {repeatCount}</>}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 0 1 .75-.75H9a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H7.5a.75.75 0 0 1-.75-.75V5.25Zm7 0a.75.75 0 0 1 .75-.75H16a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75V5.25Z" clipRule="evenodd" />
    </svg>
  );
}

function SkipBackIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M9.195 18.44c1.25.714 2.805-.189 2.805-1.629v-2.34l6.945 3.968c1.25.715 2.805-.188 2.805-1.628V8.19c0-1.44-1.555-2.343-2.805-1.628L12 10.53V8.19c0-1.44-1.555-2.343-2.805-1.628l-7.108 4.061c-1.26.72-1.26 2.536 0 3.256l7.108 4.061Z" />
    </svg>
  );
}

function SkipForwardIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M5.055 7.06C3.805 6.347 2.25 7.25 2.25 8.69v8.122c0 1.44 1.555 2.343 2.805 1.628L12 14.47v2.34c0 1.44 1.555 2.343 2.805 1.628l7.108-4.061c1.26-.72 1.26-2.536 0-3.256l-7.108-4.061C13.555 6.346 12 7.249 12 8.689v2.34L5.055 7.061Z" />
    </svg>
  );
}

