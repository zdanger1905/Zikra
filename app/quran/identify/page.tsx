"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface VerseMatch {
  surahNum: number;
  surahName: string;
  surahEnglishName: string;
  verseNum: number;
  arabicText: string;
  score: number;
}

// Strip Arabic diacritics (tashkeel) for looser matching
function stripDiacritics(text: string): string {
  return text.replace(/[\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g, "").trim();
}

// Normalize Arabic letter variants so speech recognition output matches Quran text
function normalizeArabic(text: string): string {
  return text
    .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627") // أ إ آ ٱ → ا
    .replace(/\u0649/g, "\u064A")                      // ى → ي
    .replace(/\u0629/g, "\u0647")                      // ة → ه
    .replace(/\u0624/g, "\u0648")                      // ؤ → و
    .replace(/\u0626/g, "\u064A");                     // ئ → ي
}

// Count how many words from query appear in target
function wordOverlapScore(target: string, query: string): number {
  const normalize = (s: string) => normalizeArabic(stripDiacritics(s));
  const tWords = normalize(target).split(/\s+/);
  const qWords = normalize(query).split(/\s+/).filter(w => w.length > 1);
  if (!qWords.length) return 0;
  let hits = 0;
  for (const qw of qWords) {
    if (tWords.some(tw => tw.includes(qw) || qw.includes(tw))) hits++;
  }
  return hits / qWords.length;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function IdentifyPage() {
  const router = useRouter();
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const [results, setResults] = useState<VerseMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
      setSupported(false);
    }
  }, []);

  async function searchVerses(text: string) {
    if (!text.trim()) return;
    setSearching(true);
    setResults([]);
    setError("");
    try {
      // Ask Claude to identify the verse
      const aiRes = await fetch("/api/identify-verse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      const aiJson = await aiRes.json();
      const aiMatches: { surah: number; verse: number; confidence: string }[] = aiJson.matches ?? [];

      if (aiMatches.length === 0) {
        setError("Could not identify the verse. Try reciting more clearly or a longer portion.");
        setSearching(false);
        return;
      }

      // Fetch the actual verse text for each match
      const verseData = await Promise.all(
        aiMatches.map(m =>
          fetch(`https://api.alquran.cloud/v1/ayah/${m.surah}:${m.verse}/editions/quran-uthmani,en.asad`)
            .then(r => r.json())
            .catch(() => null)
        )
      );

      const results: VerseMatch[] = [];
      for (let i = 0; i < aiMatches.length; i++) {
        const m = aiMatches[i];
        const data = verseData[i]?.data;
        const arabicEdition = Array.isArray(data) ? data[0] : null;
        results.push({
          surahNum: m.surah,
          surahName: arabicEdition?.surah?.name ?? "",
          surahEnglishName: arabicEdition?.surah?.englishName ?? "",
          verseNum: m.verse,
          arabicText: arabicEdition?.text ?? "",
          score: m.confidence === "high" ? 1 : m.confidence === "medium" ? 0.6 : 0.3,
        });
      }

      setResults(results);
    } catch {
      setError("Search failed. Please try again.");
    } finally {
      setSearching(false);
    }
  }

  function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setSupported(false); return; }

    setError("");
    setTranscript("");
    setInterimText("");
    setResults([]);

    const recognition = new SR();
    recognitionRef.current = recognition;
    recognition.lang = "ar-SA";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);

    recognition.onresult = (e: any) => {
      let final = "";
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      if (final) setTranscript(prev => (prev + " " + final).trim());
      setInterimText(interim);
    };

    recognition.onerror = (e: any) => {
      setError(e.error === "no-speech" ? "No speech detected. Try again." : `Error: ${e.error}`);
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
      setInterimText("");
      setTranscript(prev => {
        if (prev) searchVerses(prev);
        return prev;
      });
    };

    recognition.start();
  }

  function stopListening() {
    recognitionRef.current?.stop();
  }

  return (
    <div className="min-h-screen bg-[#3d3d3d]">
      <div className="max-w-2xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">Verse Finder</h1>
          <p className="text-gray-400 text-sm">Recite a verse and we'll identify it</p>
        </div>

        {!supported ? (
          <div className="bg-[#4a4a4a] rounded-2xl p-6 text-center">
            <p className="text-red-400 mb-2">Speech recognition is not supported in this browser.</p>
            <p className="text-gray-400 text-sm">Please use Chrome on desktop or Android for this feature.</p>
          </div>
        ) : (
          <>
            {/* Mic button */}
            <div className="flex flex-col items-center gap-6 mb-8">
              <button
                onClick={listening ? stopListening : startListening}
                disabled={searching}
                className={`w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-xl disabled:opacity-40 ${
                  listening
                    ? "bg-red-500 hover:bg-red-600 scale-110 animate-pulse"
                    : "bg-[#4a4a4a] hover:bg-[#5a5a5a] border-2 border-[#666]"
                }`}
              >
                <MicIcon className="w-10 h-10 text-white" />
              </button>
              <p className="text-sm text-gray-400">
                {listening ? "Listening… tap to stop" : searching ? "Searching…" : "Tap to start reciting"}
              </p>
            </div>

            {/* Live transcript */}
            {(transcript || interimText) && (
              <div className="bg-[#2a2a2a] rounded-2xl p-5 mb-6 text-right" dir="rtl">
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-2 text-left" dir="ltr">Heard</p>
                <p className="arabic text-2xl text-gray-100 leading-loose">
                  {transcript}
                  {interimText && <span className="text-gray-500"> {interimText}</span>}
                </p>
              </div>
            )}

            {/* Error */}
            {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}

            {/* Searching spinner */}
            {searching && (
              <div className="flex justify-center py-8">
                <div className="w-8 h-8 border-4 border-gray-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {/* Results */}
            {!searching && results.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">
                  {results.length === 1 ? "Best match" : "Possible matches"}
                </p>
                {results.map((r, i) => (
                  <button
                    key={`${r.surahNum}:${r.verseNum}`}
                    onClick={() => router.push(`/quran/${r.surahNum}?verse=${r.verseNum}`)}
                    className={`w-full text-left rounded-2xl p-5 border transition-all ${
                      i === 0
                        ? "bg-[#3a3a4a] border-[#6b9fff] hover:border-[#8aafff]"
                        : "bg-[#4a4a4a] border-transparent hover:border-[#666]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="text-[#6b9fff] font-semibold text-sm">{r.surahNum}:{r.verseNum}</span>
                        <span className="text-gray-400 text-xs ml-2">{r.surahEnglishName}</span>
                        {i === 0 && <span className="ml-2 text-xs bg-[#6b9fff22] text-[#6b9fff] px-2 py-0.5 rounded-full">Best match</span>}
                      </div>
                      <span className="arabic text-lg text-gray-500">{r.surahName}</span>
                    </div>
                    <p className="arabic text-xl text-gray-200 leading-loose text-right" dir="rtl">
                      {r.arabicText.length > 120 ? r.arabicText.slice(0, 120) + "…" : r.arabicText}
                    </p>
                  </button>
                ))}
              </div>
            )}

            {!searching && results.length === 0 && transcript && !error && (
              <p className="text-center text-gray-500 text-sm py-8">No matches found. Try reciting more of the verse.</p>
            )}
          </>
        )}

        <div className="mt-10 text-center">
          <Link href="/quran" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">
            ← Back to Quran
          </Link>
        </div>
      </div>
    </div>
  );
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
      <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
    </svg>
  );
}
