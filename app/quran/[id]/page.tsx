"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  getAyah,
  parseFootnoteText,
  type AsadData,
  type AsadFootnote,
  type AsadAyah,
  type FootnoteSegment,
} from "@/lib/asadQuran";
import AskAIModal from "@/components/AskAIModal";
import { auth } from "@/lib/firebase";
import { saveVerse, unsaveVerse, getSavedVerseKeys } from "@/lib/history";
import AuthModal from "@/components/AuthModal";

// ─── Types ───────────────────────────────────────────────────────────────────

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

interface WordEntry {
  arabic: string;
  translation: string;
}

// timestamps in ms (absolute within chapter audio file)
interface VerseAudio {
  timestampFrom: number;
  timestampTo: number;
  segments: number[][];  // [[wordPos1Based, startMs, endMs], ...]
}

type DisplayMode = "both" | "arabic" | "translation";

// ─── Asad data loader (cached — 5 MB JSON fetched once per page load) ────────

let _asadCache: AsadData | null = null;
let _asadPromise: Promise<AsadData> | null = null;

function loadAsadData(): Promise<AsadData> {
  if (_asadCache) return Promise.resolve(_asadCache);
  if (!_asadPromise) {
    _asadPromise = fetch("/quran_asad_annotated.json")
      .then((r) => r.json())
      .then((data) => { _asadCache = data; return data; });
  }
  return _asadPromise;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SurahPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const surahNum = Number(id);

  const [arabic, setArabic] = useState<SurahEdition | null>(null);
  const [asadData, setAsadData] = useState<AsadData | null>(null);
  const [activeFootnote, setActiveFootnote] = useState<AsadFootnote | null>(null);
  const [wordData, setWordData] = useState<Record<number, WordEntry[]> | null>(null);
  const [audioData, setAudioData] = useState<Record<string, VerseAudio> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mode, setMode] = useState<DisplayMode>("both");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("surah-theme");
      if (saved === "dark" || saved === "light") return saved;
    }
    return "light";
  });

  useEffect(() => {
    localStorage.setItem("surah-theme", theme);
  }, [theme]);
  // AI modal
  const [aiVerse, setAiVerse] = useState<{ verseNum: number; translation: string; arabic: string } | null>(null);
  // Saved verses
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [loggedIn, setLoggedIn] = useState(false);
  const [authPromptOpen, setAuthPromptOpen] = useState(false);
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      setLoggedIn(!!user);
      if (user) getSavedVerseKeys().then(setSavedKeys);
      else setSavedKeys(new Set());
    });
    return unsub;
  }, []);
  // { verseNum, wordIdx } — which word's tooltip is open
  const [activeWord, setActiveWord] = useState<{ verseNum: number; wordIdx: number } | null>(null);
  // Audio playback state
  const [playingVerse, setPlayingVerse] = useState<number | null>(null);
  const [playingWordIdx, setPlayingWordIdx] = useState<number | null>(null);
  // Single chapter audio element — shared across verses (we seek between verses)
  const chapterAudioRef = useRef<HTMLAudioElement | null>(null);
  const chapterAudioUrlRef = useRef<string | null>(null);
  // Stable refs for audio event handlers (avoid stale closures)
  const audioDataRef = useRef<Record<string, VerseAudio> | null>(null);
  const numberOfAyahsRef = useRef<number>(0);
  const surahNumRef = useRef<number>(surahNum);
  // Per-verse DOM refs for scroll-into-view
  const verseRefs = useRef<Record<number, HTMLDivElement | null>>({});
  // Sidebar + scroll state
  const [sidebarOpen, setSidebarOpen] = useState(typeof window !== "undefined" ? window.innerWidth >= 768 : true);
  const [scrolled, setScrolled] = useState(false);
  // Player UI state
  const [playerOpen, setPlayerOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loopFrom, setLoopFrom] = useState<number | null>(null);
  const [loopTo, setLoopTo] = useState<number | null>(null);
  const [loopCount, setLoopCount] = useState<number | "infinite">(1);
  // Stable refs so audio callbacks always see latest values
  const isPlayingRef = useRef(false);
  const playbackRateRef = useRef(1);
  const loopFromRef = useRef<number | null>(null);
  const loopToRef = useRef<number | null>(null);
  const loopCountRef = useRef<number | "infinite">(1);
  const loopIterationRef = useRef(1);
  const playingVerseRef = useRef<number | null>(null);

  // Stop audio when the component unmounts (user navigates away from the surah page entirely)
  useEffect(() => {
    return () => {
      if (chapterAudioRef.current) {
        chapterAudioRef.current.pause();
        chapterAudioRef.current.ontimeupdate = null;
        chapterAudioRef.current = null;
      }
    };
  }, []);

  // Fetch placement lookup once (global, not per-surah)
  // Track scroll for banner visibility
  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 10);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Keep stable refs in sync
  useEffect(() => { audioDataRef.current = audioData; }, [audioData]);
  useEffect(() => { numberOfAyahsRef.current = arabic?.numberOfAyahs ?? 0; }, [arabic]);
  useEffect(() => { surahNumRef.current = surahNum; }, [surahNum]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => {
    playbackRateRef.current = playbackRate;
    if (chapterAudioRef.current) chapterAudioRef.current.playbackRate = playbackRate;
  }, [playbackRate]);
  useEffect(() => { loopFromRef.current = loopFrom; }, [loopFrom]);
  useEffect(() => { loopToRef.current = loopTo; }, [loopTo]);
  useEffect(() => { loopCountRef.current = loopCount; }, [loopCount]);
  useEffect(() => { playingVerseRef.current = playingVerse; }, [playingVerse]);

  // Scroll playing verse into view when it changes
  useEffect(() => {
    if (playingVerse !== null) {
      verseRefs.current[playingVerse]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [playingVerse]);

  // Scroll to verse from topic search (?verse=N) after surah renders
  useEffect(() => {
    const verseParam = searchParams.get("verse");
    if (!verseParam || !arabic) return;
    const verseNum = Number(verseParam);
    if (!verseNum) return;
    // Small delay to ensure verse DOM nodes are painted
    const t = setTimeout(() => {
      verseRefs.current[verseNum]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
    return () => clearTimeout(t);
  }, [arabic, searchParams]);

  // Record surah visit in history
  useEffect(() => {
    if (!arabic) return;
    import("@/lib/history").then(({ recordSurahVisit }) => {
      recordSurahVisit(surahNum, arabic.name, arabic.englishName);
    });
  }, [arabic, surahNum]);

  useEffect(() => {
    // Stop any playing audio when navigating surahs
    if (chapterAudioRef.current) {
      chapterAudioRef.current.pause();
      chapterAudioRef.current.ontimeupdate = null;
      chapterAudioRef.current = null;
    }
    chapterAudioUrlRef.current = null;
    loopIterationRef.current = 1;
    loopFromRef.current = null;
    loopToRef.current = null;
    loopCountRef.current = 1;
    setLoopFrom(null);
    setLoopTo(null);
    setLoopCount(1);
    setPlayerOpen(false);
    setIsPlaying(false);
    setPlayingVerse(null);
    setPlayingWordIdx(null);
    setLoading(true);
    setError(false);
    setArabic(null);
    setAsadData(null);
    setWordData(null);
    setAudioData(null);
    setActiveWord(null);

    // Fetch Quran text, Asad translation, word-by-word data, and audio segments in parallel
    // asadDataCache ensures the 5 MB JSON is only downloaded once across surah navigations
    Promise.all([
      fetch(`https://api.alquran.cloud/v1/surah/${id}/editions/quran-uthmani`).then((r) =>
        r.json()
      ),
      loadAsadData(),
      fetch(
        `https://api.quran.com/api/v4/verses/by_chapter/${id}?words=true&word_fields=text_uthmani,translation_text&per_page=300`
      )
        .then((r) => r.json())
        .catch(() => null),
      fetch(
        `https://api.qurancdn.com/api/qdc/audio/reciters/7/audio_files?chapter_number=${id}&segments=true`
      )
        .then((r) => r.json())
        .catch(() => null),
    ])
      .then(([quranData, asad, wordApiData, recitationData]) => {
        if (quranData.code !== 200 || !quranData.data?.[0])
          throw new Error();
        setArabic(quranData.data[0]);
        setAsadData(asad);

        // Parse word-by-word data: verseNumber → WordEntry[]
        if (wordApiData?.verses) {
          const map: Record<number, WordEntry[]> = {};
          for (const verse of wordApiData.verses) {
            map[verse.verse_number] = (verse.words ?? [])
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .filter((w: any) => w.char_type_name === "word")
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((w: any) => ({
                arabic: w.text_uthmani ?? "",
                translation: w.translation?.text ?? "",
              }));
          }
          setWordData(map);
        }

        // Parse QDC chapter audio: one file for the whole chapter, per-verse timings inside
        if (recitationData?.audio_files?.[0]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const file = recitationData.audio_files[0] as any;
          chapterAudioUrlRef.current = file.audio_url ?? null;
          const amap: Record<string, VerseAudio> = {};
          for (const vt of file.verse_timings ?? []) {
            amap[vt.verse_key] = {
              timestampFrom: vt.timestamp_from,
              timestampTo: vt.timestamp_to,
              segments: vt.segments ?? [],
            };
          }
          setAudioData(amap);
          audioDataRef.current = amap;
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  // ── Audio playback ────────────────────────────────────────────────────────────

  // seek=true when user manually picks a verse; seek=false for auto-advance (audio already playing)
  const playVerse = useCallback((verseNum: number, seek = true) => {
    const verseKey = `${surahNumRef.current}:${verseNum}`;
    const timing = audioDataRef.current?.[verseKey];
    if (!timing || !chapterAudioUrlRef.current) return;

    if (!chapterAudioRef.current) {
      chapterAudioRef.current = new Audio(chapterAudioUrlRef.current);
    }
    const audio = chapterAudioRef.current;

    audio.ontimeupdate = null;

    if (seek) {
      audio.pause();
      audio.currentTime = timing.timestampFrom / 1000;
    }
    audio.playbackRate = playbackRateRef.current;

    setPlayingVerse(verseNum);
    setPlayingWordIdx(null);

    audio.ontimeupdate = () => {
      const ms = audio.currentTime * 1000;

      if (ms >= timing.timestampTo) {
        audio.ontimeupdate = null;
        const next = verseNum + 1;
        const effectiveLoopTo = loopToRef.current ?? numberOfAyahsRef.current;
        const effectiveLoopFrom = loopFromRef.current ?? 1;

        if (next <= effectiveLoopTo) {
          // Continue within loop range — no glitch, no seek
          playVerse(next, false);
        } else {
          // End of loop range — check if we should restart
          const count = loopCountRef.current;
          if (count === "infinite" || loopIterationRef.current < count) {
            loopIterationRef.current += 1;
            playVerse(effectiveLoopFrom, true);
          } else {
            loopIterationRef.current = 1;
            audio.pause();
            setIsPlaying(false);
            setPlayingVerse(null);
            setPlayingWordIdx(null);
          }
        }
        return;
      }

      for (const seg of timing.segments) {
        if (seg.length < 3) continue;
        if (ms >= seg[1] && ms < seg[2]) {
          setPlayingWordIdx(seg[0] - 1);
          return;
        }
      }
    };

    if (seek) {
      audio.play()
        .then(() => { setIsPlaying(true); setPlayerOpen(true); })
        .catch(() => { setPlayingVerse(null); setPlayingWordIdx(null); });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopPlayback = useCallback(() => {
    if (chapterAudioRef.current) {
      chapterAudioRef.current.pause();
      chapterAudioRef.current.ontimeupdate = null;
    }
    loopIterationRef.current = 1;
    setIsPlaying(false);
    setPlayingVerse(null);
    setPlayingWordIdx(null);
    setPlayerOpen(false);
  }, []);

  const pausePlayback = useCallback(() => {
    chapterAudioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const resumePlayback = useCallback(() => {
    chapterAudioRef.current?.play()
      .then(() => setIsPlaying(true))
      .catch(() => {});
  }, []);

  const togglePlayPause = useCallback(() => {
    if (isPlayingRef.current) pausePlayback();
    else resumePlayback();
  }, [pausePlayback, resumePlayback]);

  const skipVerse = useCallback((delta: number) => {
    const current = playingVerseRef.current ?? 1;
    if (delta === -1 && chapterAudioRef.current && audioDataRef.current) {
      const verseKey = `${surahNumRef.current}:${current}`;
      const verseStart = (audioDataRef.current[verseKey]?.timestampFrom ?? 0) / 1000;
      const isAtStart = chapterAudioRef.current.currentTime - verseStart < 2;
      if (!isAtStart) { playVerse(current, true); return; }
    }
    const next = Math.max(1, Math.min(numberOfAyahsRef.current, current + delta));
    playVerse(next, true);
  }, [playVerse]);

  // Bismillah header: show for all except Al-Fatiha (verse 1 IS Bismillah) and At-Tawbah (no Bismillah)
  const showBismillahHeader = surahNum !== 1 && surahNum !== 9;

  const prevId = surahNum > 1 ? surahNum - 1 : null;
  const nextId = surahNum < 114 ? surahNum + 1 : null;

  // Strip the Bismillah from the start of verse 1's Arabic text when we already show it as a header
  function stripLeadingBismillah(text: string): string {
    // The Bismillah ends with الرَّحِيمِ (with various diacritic combos); strip up through it
    return text.replace(/^بِسْمِ\s+.+?الرَّحِيمِ\s*/u, "").trimStart();
  }

  // ── Render states ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="w-10 h-10 border-4 border-gray-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500">Loading surah…</p>
      </div>
    );
  }

  if (error || !arabic || !asadData) {
    return (
      <div className="text-center py-20">
        <p className="text-red-500 mb-4">Failed to load surah.</p>
        <Link href="/quran" className="text-gray-300 underline">
          Back to surah list
        </Link>
      </div>
    );
  }

  return (
    <>
      {authPromptOpen && <AuthModal onClose={() => setAuthPromptOpen(false)} />}
      {aiVerse && (
        <AskAIModal
          surahNum={surahNum}
          verseNum={aiVerse.verseNum}
          verseText={aiVerse.translation}
          arabicText={aiVerse.arabic}
          onClose={() => setAiVerse(null)}
        />
      )}
      <SurahBanner
        englishName={arabic.englishName}
        arabicName={arabic.name}
        scrolled={scrolled}
        onMenuToggle={() => setSidebarOpen((o) => !o)}
        theme={theme}
        onThemeChange={setTheme}
      />
      <SurahMenu
        currentSurahNum={surahNum}
        open={sidebarOpen}
        scrolled={scrolled}
      />
      <div className={`transition-[margin] duration-300 ${sidebarOpen ? "md:ml-72" : "ml-0"} ${theme === "dark" ? "bg-[#4a4a4a]" : "bg-white"} min-h-screen`}>
      <div className="max-w-3xl mx-auto px-4 pt-20 pb-10">

      {/* Prev / next surah arrows */}
      {prevId && (
        <Link
          href={`/quran/${prevId}`}
          title="Previous surah"
          className="hidden md:flex fixed left-2 top-1/2 -translate-y-1/2 z-20 items-center justify-center w-10 h-10 bg-[#3a3a3a] border border-[#555] rounded-full shadow-md text-gray-300 hover:bg-[#4a4a4a] transition-colors"
        >
          <ChevronLeftIcon className="w-5 h-5" />
        </Link>
      )}
      {nextId && (
        <Link
          href={`/quran/${nextId}`}
          title="Next surah"
          className="hidden md:flex fixed right-2 top-1/2 -translate-y-1/2 z-20 items-center justify-center w-10 h-10 bg-[#3a3a3a] border border-[#555] rounded-full shadow-md text-gray-300 hover:bg-[#4a4a4a] transition-colors"
        >
          <ChevronRightIcon className="w-5 h-5" />
        </Link>
      )}

      {/* Header */}
      <div className="text-center mb-8">
        <p className={`arabic text-5xl leading-loose mb-2 ${theme === "dark" ? "text-white" : "text-gray-800"}`}>
          {arabic.name}
        </p>
        <h1 className={`text-3xl font-bold mb-1 ${theme === "dark" ? "text-white" : "text-gray-800"}`}>
          {arabic.englishName}
        </h1>
        <p className={`text-sm ${theme === "dark" ? "text-gray-300" : "text-gray-500"}`}>
          {arabic.englishNameTranslation} &middot; {arabic.numberOfAyahs} verses &middot;{" "}
          {arabic.revelationType}
        </p>
      </div>

      {/* Display-mode toggle */}
      <div className="flex justify-center gap-2 mb-10">
        {(["both", "arabic", "translation"] as DisplayMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-colors ${
              mode === m
                ? "bg-[#5a5a5a] text-white"
                : "bg-[#4a4a4a] text-gray-300 hover:bg-[#555]"
            }`}
          >
            {m === "both" ? "Both" : m === "arabic" ? "Arabic" : "Translation"}
          </button>
        ))}
      </div>

      {/* Bismillah header */}
      {showBismillahHeader && (
        <div className="text-center mb-10">
          <p className={`arabic text-3xl leading-loose ${theme === "dark" ? "text-gray-200" : "text-gray-700"}`}>
            بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
          </p>
          <p className={`text-sm mt-1 italic ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
            In the name of Allah, the Most Gracious, the Most Merciful
          </p>
        </div>
      )}

      {/* Verses */}
      <div>
        {arabic.ayahs.map((ayah, i) => {
          const arabicText =
            showBismillahHeader && i === 0
              ? stripLeadingBismillah(ayah.text)
              : ayah.text;

          return (
            <div
              key={ayah.numberInSurah}
              ref={(el) => { verseRefs.current[ayah.numberInSurah] = el; }}
              className={`py-8 border-b-2 last:border-0 ${theme === "dark" ? "border-gray-600" : "border-gray-200"}`}
            >
              {/* Back to results button — only on the jumped-to verse */}
              {searchParams.get("back") === "1" && ayah.numberInSurah === Number(searchParams.get("verse")) && (
                <Link
                  href={`/quran?tab=topic&q=${encodeURIComponent(searchParams.get("q") ?? "")}`}
                  className="inline-flex items-center gap-1.5 mb-3 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5M12 5l-7 7 7 7"/>
                  </svg>
                  Back to results
                </Link>
              )}

              {/* Verse header row */}
              <div className="flex justify-between items-center mb-4">
                {/* Left: verse badge + play */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-200 bg-[#5a5a5a] px-2 py-1 rounded-full flex-shrink-0">
                    {surahNum}:{ayah.numberInSurah}
                  </span>
                  {audioData && (
                    <button
                      onClick={() => {
                        setLoopFrom(null); loopFromRef.current = null;
                        setLoopTo(null);   loopToRef.current = null;
                        setLoopCount(1);   loopCountRef.current = 1;
                        loopIterationRef.current = 1;
                        playVerse(ayah.numberInSurah);
                      }}
                      title="Play recitation"
                      className="flex items-center justify-center w-7 h-7 rounded-full bg-[#5a5a5a] text-gray-200 hover:bg-[#666] transition-colors flex-shrink-0"
                    >
                      <PlayIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {/* Right: Save + AI buttons */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {(() => {
                    const key = `${surahNum}-${ayah.numberInSurah}`;
                    const saved = savedKeys.has(key);
                    return (
                      <button
                        onClick={async () => {
                          if (!loggedIn) { setAuthPromptOpen(true); return; }
                          if (saved) {
                            await unsaveVerse(surahNum, ayah.numberInSurah);
                            setSavedKeys((prev) => { const s = new Set(prev); s.delete(key); return s; });
                          } else {
                            const parsed = getAyah(surahNum, ayah.numberInSurah, asadData!);
                            const translation = parsed?.segments.filter(s => s.type === "text").map(s => s.content).join("") ?? "";
                            await saveVerse(surahNum, ayah.numberInSurah, arabic!.englishName, translation);
                            setSavedKeys((prev) => new Set(prev).add(key));
                          }
                        }}
                        title={saved ? "Unsave verse" : "Save verse"}
                        className="flex items-center justify-center w-7 h-7 rounded-full bg-[#5a5a5a] hover:bg-[#6b9fff] transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={saved ? "text-white" : "text-gray-300"}>
                          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                        </svg>
                      </button>
                    );
                  })()}
                  <button
                    onClick={() => {
                      const parsed = getAyah(surahNum, ayah.numberInSurah, asadData!);
                      const translation = parsed?.segments.filter(s => s.type === "text").map(s => s.content).join("") ?? "";
                      setAiVerse({ verseNum: ayah.numberInSurah, translation, arabic: ayah.text });
                    }}
                    title="Ask AI about this verse"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#5a5a5a] text-gray-300 hover:bg-[#6b9fff] hover:text-white transition-colors text-xs font-medium"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    Ask AI
                  </button>
                </div>
              </div>

              {/* Arabic — interactive word-by-word when data available */}
              {(mode === "both" || mode === "arabic") && (
                <ArabicWords
                  text={arabicText}
                  words={wordData?.[ayah.numberInSurah] ?? null}
                  verseNum={ayah.numberInSurah}
                  activeWord={activeWord}
                  playingWordIdx={playingVerse === ayah.numberInSurah ? playingWordIdx : null}
                  theme={theme}
                  onWordClick={(verseNum, wordIdx) =>
                    setActiveWord(
                      activeWord?.verseNum === verseNum && activeWord?.wordIdx === wordIdx
                        ? null
                        : { verseNum, wordIdx }
                    )
                  }
                  onClose={() => setActiveWord(null)}
                />
              )}

              {/* Asad translation with footnote superscripts */}
              {(mode === "both" || mode === "translation") && (() => {
                const parsed = getAyah(surahNum, ayah.numberInSurah, asadData);
                return (
                  <p className={`leading-relaxed ${theme === "dark" ? "text-gray-300" : "text-gray-600"}`}>
                    {parsed?.segments.map((seg, si) =>
                      seg.type === "text" ? (
                        <span key={si}>{seg.content}</span>
                      ) : (
                        <sup
                          key={si}
                          onClick={() => setActiveFootnote({ number: seg.number, text: seg.text })}
                          className={`cursor-pointer font-semibold ml-0.5 select-none ${theme === "dark" ? "text-amber-400 hover:text-amber-200" : "text-amber-600 hover:text-amber-800"}`}
                          title={`Footnote ${seg.number}`}
                        >
                          {seg.number}
                        </sup>
                      )
                    )}
                    {parsed?.groupedWith && (
                      <span className={`text-xs ml-2 italic ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
                        [combined with {parsed.groupedWith}]
                      </span>
                    )}
                  </p>
                );
              })()}
            </div>
          );
        })}
      </div>

      {/* Attribution */}
      <p className={`text-center text-xs mt-8 mb-2 ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
        Translation: <span className="italic">The Message of The Quran</span> — Muhammad Asad
      </p>

      {/* Prev / Next navigation */}
      <div className={`flex justify-between items-center mt-4 pt-6 border-t ${theme === "dark" ? "border-gray-600" : "border-gray-200"}`}>
        {prevId ? (
          <Link
            href={`/quran/${prevId}`}
            className="flex items-center gap-1 text-gray-300 hover:underline text-sm font-medium"
          >
            <ChevronLeftIcon className="w-4 h-4" />
            Previous
          </Link>
        ) : (
          <div />
        )}
        <span className="text-sm text-gray-400">{surahNum} / 114</span>
        {nextId ? (
          <Link
            href={`/quran/${nextId}`}
            className="flex items-center gap-1 text-gray-300 hover:underline text-sm font-medium"
          >
            Next
            <ChevronRightIcon className="w-4 h-4" />
          </Link>
        ) : (
          <div />
        )}
      </div>

      {/* Footnote modal */}
      {activeFootnote && asadData && (
        <FootnoteModal
          footnote={activeFootnote}
          currentSurah={surahNum}
          asadData={asadData}
          onClose={() => setActiveFootnote(null)}
        />
      )}

      {/* Bottom player */}
      {playerOpen && playingVerse !== null && (
        <BottomPlayer
          playingVerse={playingVerse}
          totalVerses={arabic.numberOfAyahs}
          isPlaying={isPlaying}
          playbackRate={playbackRate}
          loopFrom={loopFrom}
          loopTo={loopTo}
          loopCount={loopCount}
          onTogglePlayPause={togglePlayPause}
          onPrev={() => skipVerse(-1)}
          onNext={() => skipVerse(1)}
          onClose={stopPlayback}
          onPlaybackRateChange={setPlaybackRate}
          onLoopChange={(from: number | null, to: number | null, count: number | "infinite") => {
            setLoopFrom(from);
            setLoopTo(to);
            setLoopCount(count);
            loopIterationRef.current = 1;
          }}
        />
      )}
      </div>
      </div>
    </>
  );
}

// ─── FootnoteModal ────────────────────────────────────────────────────────────

interface ActiveRef {
  uid: string;
  surah: number;
  verse: number;
  footnoteNum?: number;
  ayah: AsadAyah | null;
  fnText?: string;
  expandedFn?: number;
}

function FootnoteModal({
  footnote,
  currentSurah,
  asadData,
  onClose,
}: {
  footnote: AsadFootnote;
  currentSurah: number;
  asadData: AsadData;
  onClose: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [activeRefs, setActiveRefs] = useState<ActiveRef[]>([]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Parse footnote body for cross-references once per footnote
  const segments: FootnoteSegment[] = useMemo(
    () => parseFootnoteText(footnote.text, currentSurah, asadData),
    [footnote.text, currentSurah, asadData]
  );

  function handleRefClick(seg: { surah: number; verse: number; verseEnd?: number; footnoteNum?: number }) {
    if (seg.verseEnd !== undefined) {
      const uids = Array.from({ length: seg.verseEnd - seg.verse + 1 }, (_, i) =>
        `${seg.surah}:${seg.verse + i}:`
      );
      setActiveRefs((prev) => {
        const allActive = uids.every((uid) => prev.some((r) => r.uid === uid));
        if (allActive) return prev.filter((r) => !uids.includes(r.uid));
        const existing = new Set(prev.map((r) => r.uid));
        const toAdd: ActiveRef[] = [];
        for (let v = seg.verse; v <= seg.verseEnd!; v++) {
          const uid = `${seg.surah}:${v}:`;
          if (!existing.has(uid))
            toAdd.push({ uid, surah: seg.surah, verse: v, ayah: getAyah(seg.surah, v, asadData) });
        }
        return [...prev, ...toAdd];
      });
      return;
    }
    const uid = `${seg.surah}:${seg.verse}:${seg.footnoteNum ?? ""}`;
    setActiveRefs((prev) => {
      if (prev.some((r) => r.uid === uid)) return prev.filter((r) => r.uid !== uid);
      const ayah = getAyah(seg.surah, seg.verse, asadData);
      const fnText = seg.footnoteNum
        ? asadData.footnotes[String(seg.surah)]?.[String(seg.footnoteNum)]
        : undefined;
      return [...prev, { uid, ...seg, ayah, fnText }];
    });
  }

  function handleInlineFnClick(refUid: string, surah: number, fnNum: number) {
    setActiveRefs((prev) =>
      prev.map((r) =>
        r.uid === refUid
          ? { ...r, expandedFn: r.expandedFn === fnNum ? undefined : fnNum }
          : r
      )
    );
  }

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      className="fixed inset-0 z-50 bg-black/50"
    >
      {/* ── Wrapper: stacks vertically on mobile, side-by-side on desktop ── */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col md:flex-row md:items-start gap-3 max-h-[90vh] max-w-[92vw] overflow-y-auto">

      {/* ── Main footnote panel ── */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-[32rem] max-w-full max-h-[80vh] overflow-y-auto p-6 flex-shrink-0">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          aria-label="Close"
        >
          <XIcon className="w-5 h-5" />
        </button>
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-3">
          Footnote {footnote.number}
        </p>
        {footnote.text ? (
          <p className="text-gray-700 dark:text-gray-200 leading-relaxed text-sm">
            {segments.map((seg, i) =>
              seg.type === "text" ? (
                <span key={i}>{seg.content}</span>
              ) : (
                <button
                  key={i}
                  onClick={() => handleRefClick(seg)}
                  className={`cursor-pointer transition-colors ${
                    (seg.verseEnd !== undefined
                      ? activeRefs.some((r) => r.uid === `${seg.surah}:${seg.verse}:`)
                      : activeRefs.some((r) => r.uid === `${seg.surah}:${seg.verse}:${seg.footnoteNum ?? ""}`))
                      ? "text-blue-400"
                      : "text-blue-500 hover:text-blue-700"
                  }`}
                >
                  {seg.display}
                </button>
              )
            )}
          </p>
        ) : (
          <p className="text-gray-400 dark:text-gray-500 text-sm italic">
            Footnote text not available in this dataset.
          </p>
        )}
      </div>

      {/* ── Referenced ayahs ── */}
      {activeRefs.length > 0 && (
        <div className="flex flex-col gap-3 w-full md:w-96 flex-shrink-0">
          {activeRefs.map((ref) => (
            <div key={ref.uid} className="bg-gray-100 dark:bg-gray-700 rounded-2xl shadow-lg p-4 relative">
              <button
                onClick={() => handleRefClick(ref)}
                className="absolute top-3 right-3 text-gray-400 hover:text-gray-500"
                aria-label="Close reference"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>

              {/* Verse key */}
              <p className="text-xs font-semibold text-blue-400 mb-2">
                {ref.surah}:{ref.verse}
              </p>

              {/* Verse translation */}
              {ref.ayah ? (
                <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
                  {ref.ayah.segments.map((s, si) =>
                    s.type === "text" ? (
                      <span key={si}>{s.content}</span>
                    ) : (
                      <sup key={si} className="ml-0.5">
                        <button
                          onClick={() => handleInlineFnClick(ref.uid, ref.surah, s.number)}
                          className={`text-xs font-semibold cursor-pointer transition-colors ${
                            (ref.expandedFn === s.number) ||
                            (ref.expandedFn === undefined && ref.footnoteNum === s.number)
                              ? "text-blue-400"
                              : "text-blue-500 hover:text-blue-700"
                          }`}
                        >
                          {s.number}
                        </button>
                      </sup>
                    )
                  )}
                </p>
              ) : (
                <p className="text-gray-400 text-sm italic">Verse not found</p>
              )}

              {/* Footnote text — expandedFn takes priority, fallback to targeted footnoteNum */}
              {(ref.footnoteNum !== undefined || ref.expandedFn !== undefined) && (() => {
                const fn = ref.expandedFn ?? ref.footnoteNum!;
                const fnText = ref.expandedFn !== undefined
                  ? asadData.footnotes[String(ref.surah)]?.[String(ref.expandedFn)]
                  : ref.fnText;
                return (
                  <p className="text-gray-400 dark:text-gray-500 text-xs leading-relaxed mt-2">
                    <span className="font-semibold text-blue-400">Note {fn}: </span>
                    {fnText || <span className="italic">Footnote text not available in this dataset.</span>}
                  </p>
                );
              })()}
            </div>
          ))}
        </div>
      )}
      </div>{/* end wrapper */}
    </div>
  );
}

// ─── ArabicWords ──────────────────────────────────────────────────────────────

function ArabicWords({
  text,
  words,
  verseNum,
  activeWord,
  playingWordIdx,
  theme,
  onWordClick,
  onClose,
}: {
  text: string;
  words: WordEntry[] | null;
  verseNum: number;
  activeWord: { verseNum: number; wordIdx: number } | null;
  playingWordIdx: number | null;
  theme: "light" | "dark";
  onWordClick: (verseNum: number, wordIdx: number) => void;
  onClose: () => void;
}) {
  // Close tooltip on outside click
  const containerRef = useRef<HTMLDivElement>(null);
  const handleOutside = useCallback(
    (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose]
  );
  useEffect(() => {
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [handleOutside]);

  // Fallback: no word data, render plain text
  if (!words || words.length === 0) {
    return (
      <p className={`arabic leading-loose text-right mb-5 ${theme === "dark" ? "text-gray-100" : "text-gray-800"}`} style={{fontSize:"1.9em"}}>
        {text}
      </p>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`arabic leading-loose text-right mb-5 ${theme === "dark" ? "text-gray-100" : "text-gray-800"}`}
      style={{fontSize:"1.9em"}}
      dir="rtl"
    >
      {words.map((word, wordIdx) => {
        const isClicked = activeWord?.verseNum === verseNum && activeWord?.wordIdx === wordIdx;
        const isPlaying = playingWordIdx === wordIdx;
        const isHighlighted = isClicked || isPlaying;
        return (
          <span key={wordIdx} className="relative inline-block leading-loose mx-0.5">
            <button
              onClick={() => onWordClick(verseNum, wordIdx)}
              className={`transition-colors duration-150 cursor-pointer ${
                isHighlighted ? "text-[#6b9fff]" : "hover:text-[#6b9fff]"
              }`}
            >
              {word.arabic}
            </button>

            {/* Tooltip bubble — only on click, not on audio highlight */}
            {isClicked && word.translation && (
              <span
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 pointer-events-none"
                style={{ direction: "ltr" }}
              >
                <span className="relative block bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs font-sans font-medium px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap">
                  {word.translation}
                  {/* Arrow */}
                  <span className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-900 dark:border-t-gray-100" />
                </span>
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

// ─── BottomPlayer ─────────────────────────────────────────────────────────────

function BottomPlayer({
  playingVerse,
  totalVerses,
  isPlaying,
  playbackRate,
  loopFrom,
  loopTo,
  loopCount,
  onTogglePlayPause,
  onPrev,
  onNext,
  onClose,
  onPlaybackRateChange,
  onLoopChange,
}: {
  playingVerse: number;
  totalVerses: number;
  isPlaying: boolean;
  playbackRate: number;
  loopFrom: number | null;
  loopTo: number | null;
  loopCount: number | "infinite";
  onTogglePlayPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onPlaybackRateChange: (rate: number) => void;
  onLoopChange: (from: number | null, to: number | null, count: number | "infinite") => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [fromInput, setFromInput] = useState(loopFrom?.toString() ?? "");
  const [toInput, setToInput] = useState(loopTo?.toString() ?? "");
  const [countInput, setCountInput] = useState(
    loopCount === "infinite" ? "1" : String(loopCount)
  );
  const [infinite, setInfinite] = useState(loopCount === "infinite");

  const SPEEDS = [0.25, 0.5, 1, 1.5, 2] as const;

  // Close menu on outside click
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  function applyLoop() {
    const from = fromInput.trim() === "" ? null : parseInt(fromInput, 10);
    const to = toInput.trim() === "" ? null : parseInt(toInput, 10);
    const count: number | "infinite" = infinite
      ? "infinite"
      : Math.max(1, parseInt(countInput, 10) || 1);
    onLoopChange(
      from !== null && !isNaN(from) ? from : null,
      to !== null && !isNaN(to) ? to : null,
      count
    );
    setMenuOpen(false);
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center">
      <div className="relative flex items-center gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-full shadow-2xl px-5 py-3">

        {/* Left edge: ellipsis menu */}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            title="Options"
          >
            <EllipsisIcon className="w-5 h-5" />
          </button>

          {/* Popup menu — anchored above left edge */}
          {menuOpen && (
            <div className="absolute bottom-full left-0 mb-4 w-72 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 p-4 space-y-5">
              {/* Speed */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
                  Playback Speed
                </p>
                <div className="flex flex-wrap gap-2">
                  {SPEEDS.map((s) => (
                    <button
                      key={s}
                      onClick={() => onPlaybackRateChange(s)}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                        playbackRate === s
                          ? "bg-[#5a5a5a] text-white"
                          : "bg-[#4a4a4a] text-gray-300 hover:bg-[#555]"
                      }`}
                    >
                      {s === 1 ? "Normal" : `${s}×`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Loop */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
                  Loop Settings
                </p>
                <div className="flex gap-2 mb-2">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 block mb-1">From verse</label>
                    <input
                      type="number"
                      min={1}
                      max={totalVerses}
                      placeholder="Start"
                      value={fromInput}
                      onChange={(e) => setFromInput(e.target.value)}
                      className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 block mb-1">To verse</label>
                    <input
                      type="number"
                      min={1}
                      max={totalVerses}
                      placeholder="End"
                      value={toInput}
                      onChange={(e) => setToInput(e.target.value)}
                      className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                    />
                  </div>
                </div>
                <div className="flex items-end gap-3 mb-3">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 block mb-1">Times</label>
                    <input
                      type="number"
                      min={1}
                      placeholder="1"
                      value={countInput}
                      disabled={infinite}
                      onChange={(e) => setCountInput(e.target.value)}
                      className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 disabled:opacity-40"
                    />
                  </div>
                  <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 pb-1 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={infinite}
                      onChange={(e) => setInfinite(e.target.checked)}
                      className="w-3.5 h-3.5 accent-gray-400"
                    />
                    ∞ Infinite
                  </label>
                </div>
                <button
                  onClick={applyLoop}
                  className="w-full py-1.5 rounded-lg bg-[#5a5a5a] hover:bg-[#666] text-white text-sm font-medium transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Transport: skip back | play/pause | skip forward */}
        <button
          onClick={onPrev}
          disabled={playingVerse <= 1}
          className="text-gray-500 dark:text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
          title="Previous verse"
        >
          <SkipBackIcon className="w-5 h-5" />
        </button>

        <button
          onClick={onTogglePlayPause}
          className="w-11 h-11 rounded-full bg-[#5a5a5a] hover:bg-[#666] text-white flex items-center justify-center transition-colors shadow-md"
        >
          {isPlaying ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
        </button>

        <button
          onClick={onNext}
          disabled={playingVerse >= totalVerses}
          className="text-gray-500 dark:text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
          title="Next verse"
        >
          <SkipForwardIcon className="w-5 h-5" />
        </button>

        {/* Right edge: close */}
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          title="Close player"
        >
          <XIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── SurahMenu ────────────────────────────────────────────────────────────────

interface SurahListItem {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
}

// ─── SurahBanner ──────────────────────────────────────────────────────────────

function SurahBanner({
  englishName,
  arabicName,
  scrolled,
  onMenuToggle,
  theme,
  onThemeChange,
}: {
  englishName: string;
  arabicName: string;
  scrolled: boolean;
  onMenuToggle: () => void;
  theme: "light" | "dark";
  onThemeChange: (t: "light" | "dark") => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<"theme">("theme");
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(e.target as Node))
        setSettingsOpen(false);
    }
    if (settingsOpen) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [settingsOpen]);

  return (
    <>
      <div className="fixed left-0 right-0 top-0 z-40 h-16 bg-[#1a1a1a] text-white flex items-center px-4 gap-4 transition-transform duration-300 translate-y-12">
        {/* Left: surah list toggle */}
        <button
          onClick={onMenuToggle}
          aria-label="Toggle surah list"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-300 hover:bg-[#333] hover:text-white transition-colors text-sm font-medium shrink-0"
        >
          <MenuIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Surahs</span>
        </button>

        {/* Center: surah title */}
        <div className="flex-1 flex items-center justify-center gap-3 min-w-0 overflow-hidden">
          <span className="font-semibold text-white truncate">{englishName}</span>
          <span className="arabic text-lg text-white shrink-0">{arabicName}</span>
        </div>

        {/* Right: settings button */}
        <button
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          className="flex items-center px-3 py-2 rounded-lg text-gray-300 hover:bg-[#333] hover:text-white transition-colors shrink-0"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Settings modal — centered overlay */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div
            ref={modalRef}
            className="relative flex w-[480px] max-w-[90vw] h-64 bg-[#2a2a2a] border border-[#444] rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* X close button */}
            <button
              onClick={() => setSettingsOpen(false)}
              className="absolute top-3 right-3 text-gray-400 hover:text-white transition-colors z-10"
              aria-label="Close settings"
            >
              <XIcon className="w-4 h-4" />
            </button>

            {/* Left: settings nav */}
            <div className="w-36 shrink-0 bg-[#222] border-r border-[#3a3a3a] flex flex-col py-4 px-2">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-3 px-2">Settings</p>
              <button
                onClick={() => setActiveSection("theme")}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                  activeSection === "theme"
                    ? "bg-[#3a3a3a] text-white"
                    : "text-gray-400 hover:bg-[#333] hover:text-white"
                }`}
              >
                <PaletteIcon className="w-4 h-4 shrink-0" />
                Theme
              </button>
            </div>

            {/* Right: setting options */}
            <div className="flex-1 py-4 px-5 overflow-y-auto">
              {activeSection === "theme" && (
                <>
                  <p className="text-xs text-gray-500 uppercase tracking-widest mb-4">Theme</p>
                  <div className="flex flex-col gap-2">
                    {(["light", "dark"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => onThemeChange(t)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors ${
                          theme === t
                            ? "bg-[#4a4a4a] text-white"
                            : "text-gray-400 hover:bg-[#383838] hover:text-white"
                        }`}
                      >
                        <span>{t === "light" ? "☀️" : "🌙"}</span>
                        <span className="capitalize">{t} Mode</span>
                        {theme === t && <span className="ml-auto text-[#6b9fff]">✓</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── SurahMenu ────────────────────────────────────────────────────────────────

function SurahMenu({
  currentSurahNum,
  open,
  scrolled,
}: {
  currentSurahNum: number;
  open: boolean;
  scrolled: boolean;
}) {
  const [surahs, setSurahs] = useState<SurahListItem[]>([]);
  const [search, setSearch] = useState("");
  const activeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    fetch("https://api.alquran.cloud/v1/surah")
      .then((r) => r.json())
      .then((d) => setSurahs(d.data ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (open && activeRef.current) {
      activeRef.current.scrollIntoView({ block: "center" });
    }
  }, [open, surahs]);

  const filtered = surahs.filter(
    (s) =>
      s.englishName.toLowerCase().includes(search.toLowerCase()) ||
      s.englishNameTranslation.toLowerCase().includes(search.toLowerCase()) ||
      s.number.toString().includes(search)
  );

  const panelTop = "top-28";
  const panelHeight = "h-[calc(100vh-7rem)]";

  return (
    <div
      className={`fixed left-0 z-30 w-72 bg-[#2a2a2a] border-r border-[#444] flex flex-col transition-transform duration-300 ${panelTop} ${panelHeight} ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      {/* Search */}
      <div className="p-3 border-b border-[#444] shrink-0">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search surahs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-[#3a3a3a] outline-none focus:ring-2 focus:ring-gray-500 placeholder:text-gray-500 text-gray-100"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map((s) => {
          const isActive = s.number === currentSurahNum;
          return (
            <Link
              key={s.number}
              href={`/quran/${s.number}`}
              ref={isActive ? activeRef : null}
              className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                isActive
                  ? "bg-[#4a4a4a] text-white font-semibold"
                  : "text-gray-300 hover:bg-[#3a3a3a]"
              }`}
            >
              <span className="w-7 shrink-0 text-center text-xs font-mono text-gray-400 dark:text-gray-500">
                {s.number}
              </span>
              <span className="flex-1 truncate">{s.englishName}</span>
              <span className="arabic text-base text-gray-400 dark:text-gray-500 shrink-0">
                {s.name}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className={className}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className={className}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M8 5.14v14l11-7-11-7z" />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}

function SkipBackIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      {/* vertical bar on left + triangle pointing left */}
      <path d="M6 6h2v12H6V6zm10 0L8 12l8 6V6z" />
    </svg>
  );
}

function SkipForwardIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      {/* triangle pointing right + vertical bar on right */}
      <path d="M8 6l8 6-8 6V6zm8 0h2v12h-2V6z" />
    </svg>
  );
}

function EllipsisIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className={className}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className={className}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className={className}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  );
}

function PaletteIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 0 0 5.304 0l6.401-6.402M6.75 21A3.75 3.75 0 0 1 3 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 0 0 3.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008Z" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className={className}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}
