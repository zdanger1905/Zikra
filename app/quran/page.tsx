"use client";

import React, { useEffect, useState, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

interface Surah {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  numberOfAyahs: number;
  revelationType: string;
}

interface TopicResult {
  surahNum: number;
  surahName: string;
  verseNum: number;
  text: string;
}

function highlightTerm(text: string, term: string): React.ReactNode[] {
  if (!term.trim()) return [text];
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped}\\w*)`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    new RegExp(`^${escaped}\\w*$`, "i").test(part)
      ? <span key={i} style={{ color: "#6b9fff", fontWeight: 600 }}>{part}</span>
      : part
  );
}

export default function QuranPage() {
  return <Suspense><QuranPageInner /></Suspense>;
}

function QuranPageInner() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"surah" | "topic">(
    searchParams.get("tab") === "topic" ? "topic" : "surah"
  );

  // Surah tab
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Topic tab
  const [topicQuery, setTopicQuery] = useState(searchParams.get("q") ?? "");
  const [topicResults, setTopicResults] = useState<TopicResult[]>([]);
  const [topicLoading, setTopicLoading] = useState(false);
  const [topicSearched, setTopicSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("https://api.alquran.cloud/v1/surah")
      .then((r) => r.json())
      .then((data) => { setSurahs(data.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Debounced topic search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = topicQuery.trim();
    if (!q) { setTopicResults([]); setTopicSearched(false); return; }
    debounceRef.current = setTimeout(async () => {
      setTopicLoading(true);
      setTopicSearched(true);
      try {
        const res = await fetch(
          `https://api.alquran.cloud/v1/search/${encodeURIComponent(q)}/all/en.asad`
        );
        const json = await res.json();
        const matches: any[] = json?.data?.matches ?? [];
        setTopicResults(
          matches.slice(0, 50).map((m: any) => ({
            surahNum: m.surah?.number ?? 0,
            surahName: m.surah?.englishName ?? "",
            verseNum: m.numberInSurah ?? 0,
            text: m.text ?? "",
          }))
        );
      } catch {
        setTopicResults([]);
      } finally {
        setTopicLoading(false);
      }
    }, 500);
  }, [topicQuery]);

  // Scroll to top on fresh load (no back-navigation)
  useEffect(() => {
    if (!searchParams.get("from")) window.scrollTo(0, 0);
  }, []);

  // Scroll to the result the user came from
  useEffect(() => {
    const from = searchParams.get("from");
    if (!from || topicLoading || topicResults.length === 0) return;
    const t = setTimeout(() => {
      const el = document.getElementById(`result-${from}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    return () => clearTimeout(t);
  }, [topicResults, topicLoading, searchParams]);

  const filtered = surahs.filter(
    (s) =>
      s.englishName.toLowerCase().includes(search.toLowerCase()) ||
      s.name.includes(search) ||
      s.englishNameTranslation.toLowerCase().includes(search.toLowerCase()) ||
      s.number.toString().includes(search)
  );

  return (
    <div className="min-h-screen bg-[#3d3d3d]">
      <div className="max-w-4xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="text-center mb-10">
          <p className="arabic text-4xl text-white mb-2 leading-loose">القُرآنُ الكَريم</p>
          <h1 className="text-3xl font-bold text-white mb-1">The Holy Quran</h1>
          <p className="text-gray-400">Browse all 114 surahs</p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#555] mb-6">
          {(["surah", "topic"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-6 py-2.5 text-sm font-semibold uppercase tracking-widest transition-colors ${
                tab === t
                  ? "text-white border-b-2 border-[#6b9fff] -mb-px"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {t === "surah" ? "Surah" : "Topic"}
            </button>
          ))}
        </div>

        {/* Search bar */}
        <div className="relative mb-8">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          {tab === "surah" ? (
            <input
              type="text"
              placeholder="Search by name, translation, or number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-xl border border-[#555] bg-[#4a4a4a] text-gray-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-500 placeholder:text-gray-500"
            />
          ) : (
            <input
              type="text"
              placeholder="Search a word or topic across the entire Quran..."
              value={topicQuery}
              onChange={(e) => setTopicQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-xl border border-[#555] bg-[#4a4a4a] text-gray-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-500 placeholder:text-gray-500"
            />
          )}
        </div>

        {/* Surah tab content */}
        {tab === "surah" && (
          <>
            {loading && (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-10 h-10 border-4 border-gray-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-400">Loading surahs...</p>
              </div>
            )}
            {!loading && (
              <div className="grid gap-2">
                {filtered.map((surah) => (
                  <Link
                    key={surah.number}
                    href={`/quran/${surah.number}`}
                    className="flex items-center gap-4 bg-[#4a4a4a] rounded-xl p-4 shadow-sm border border-transparent hover:border-[#888] hover:shadow-md transition-all group"
                  >
                    <div className="w-11 h-11 flex items-center justify-center bg-[#5a5a5a] rounded-full text-[#c8c8c8] font-bold text-sm flex-shrink-0">
                      {surah.number}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-100 group-hover:text-white transition-colors">
                        {surah.englishName}
                      </p>
                      <p className="text-sm text-gray-400">
                        {surah.englishNameTranslation} &middot; {surah.numberOfAyahs} verses &middot;{" "}
                        {surah.revelationType}
                      </p>
                    </div>
                    <p className="arabic text-xl text-gray-300 flex-shrink-0">{surah.name}</p>
                    <ChevronIcon className="w-5 h-5 text-gray-400 flex-shrink-0 group-hover:translate-x-1 transition-transform" />
                  </Link>
                ))}
                {filtered.length === 0 && (
                  <p className="text-center text-gray-400 py-12">No surahs found for &quot;{search}&quot;</p>
                )}
              </div>
            )}
          </>
        )}

        {/* Topic tab content */}
        {tab === "topic" && (
          <>
            {topicLoading && (
              <div className="flex justify-center py-20">
                <div className="w-10 h-10 border-4 border-gray-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {!topicLoading && !topicSearched && (
              <p className="text-center text-gray-500 py-16">
                Type a word or topic to search across the entire Quran.
              </p>
            )}
            {!topicLoading && topicSearched && topicResults.length === 0 && (
              <p className="text-center text-gray-400 py-16">No results found for &quot;{topicQuery}&quot;</p>
            )}
            {!topicLoading && topicResults.length > 0 && (
              <div className="grid gap-2">
                {topicResults.map((r, i) => (
                  <Link
                    key={i}
                    href={`/quran/${r.surahNum}?verse=${r.verseNum}&back=1&q=${encodeURIComponent(topicQuery.trim())}&from=${r.surahNum}-${r.verseNum}`}
                    className="flex gap-4 bg-[#4a4a4a] rounded-xl p-4 border border-transparent hover:border-[#888] transition-all group"
                    id={`result-${r.surahNum}-${r.verseNum}`}
                  >
                    {/* Verse badge */}
                    <div className="flex items-center justify-center bg-[#5a5a5a] rounded-xl px-3 py-2 flex-shrink-0">
                      <span className="text-[#6b9fff] font-bold text-sm">{r.surahNum}:{r.verseNum}</span>
                    </div>
                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 mb-1">{r.surahName}</p>
                      <p className="text-gray-200 text-sm leading-relaxed">
                        {highlightTerm(r.text, topicQuery.trim())}
                      </p>
                    </div>
                    <ChevronIcon className="w-5 h-5 text-gray-400 flex-shrink-0 self-center group-hover:translate-x-1 transition-transform" />
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  );
}
