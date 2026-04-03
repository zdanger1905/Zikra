"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getQuranHistory, getAIChats, timeAgo, type QuranVisit, type AIChat } from "@/lib/history";
import AskAIModal, { type Message } from "@/components/AskAIModal";

export default function HistoryPage() {
  return <Suspense><HistoryPageInner /></Suspense>;
}

function HistoryPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [tab, setTab] = useState<"quran" | "ai">(
    searchParams.get("tab") === "ai" ? "ai" : "quran"
  );

  const [quranHistory, setQuranHistory] = useState<QuranVisit[]>([]);
  const [aiChats, setAiChats] = useState<AIChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [resumeChat, setResumeChat] = useState<AIChat | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  useEffect(() => {
    if (user === undefined) return;
    if (!user) { setLoading(false); return; }
    Promise.all([getQuranHistory(), getAIChats()]).then(([qh, ac]) => {
      setQuranHistory(qh);
      setAiChats(ac);
      setLoading(false);
    });
  }, [user]);

  if (user === undefined) return null;

  if (!user) {
    return (
      <div className="min-h-screen bg-[#3d3d3d] flex items-center justify-center">
        <p className="text-gray-400 text-sm">Please log in to view your history.</p>
      </div>
    );
  }

  const tabs = [
    { id: "quran", label: "Quran" },
    { id: "ai",    label: "AI Chats" },
  ] as const;

  return (
    <>
      {resumeChat && (
        <AskAIModal
          surahNum={resumeChat.surahNum}
          verseNum={resumeChat.verseNum}
          verseText={resumeChat.verseText}
          arabicText={resumeChat.arabicText}
          initialMessages={resumeChat.messages as Message[]}
          chatId={resumeChat.id}
          onClose={() => setResumeChat(null)}
        />
      )}

      <div className="min-h-screen bg-[#3d3d3d]">
        <div className="max-w-3xl mx-auto px-4 py-10">

          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-white mb-1">History</h1>
            <p className="text-gray-400 text-sm">Your recent activity</p>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-[#555] mb-6">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-6 py-2.5 text-sm font-semibold uppercase tracking-widest transition-colors ${
                  tab === t.id
                    ? "text-white border-b-2 border-[#6b9fff] -mb-px"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {loading && (
            <div className="flex justify-center py-20">
              <div className="w-10 h-10 border-4 border-gray-400 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Quran History */}
          {!loading && tab === "quran" && (
            quranHistory.length === 0 ? (
              <p className="text-center text-gray-500 py-16">No Quran history yet. Start reading a surah.</p>
            ) : (
              <div className="grid gap-2">
                {quranHistory.map((v) => (
                  <button key={v.id} onClick={() => router.push(`/quran/${v.surahNum}`)}
                    className="flex items-center gap-4 bg-[#4a4a4a] rounded-xl p-4 border border-transparent hover:border-[#888] transition-all text-left w-full"
                  >
                    <div className="w-11 h-11 flex items-center justify-center bg-[#5a5a5a] rounded-full text-[#c8c8c8] font-bold text-sm flex-shrink-0">
                      {v.surahNum}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-100">{v.surahEnglishName}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{v.surahName}</p>
                    </div>
                    <p className="text-xs text-gray-400 flex-shrink-0">{timeAgo(v.visitedAt)}</p>
                  </button>
                ))}
              </div>
            )
          )}

          {/* AI Chat History */}
          {!loading && tab === "ai" && (
            aiChats.length === 0 ? (
              <p className="text-center text-gray-500 py-16">No AI chats yet. Ask a question about a verse.</p>
            ) : (
              <div className="grid gap-2">
                {aiChats.map((chat) => (
                  <button key={chat.id} onClick={() => setResumeChat(chat)}
                    className="flex items-center gap-4 bg-[#4a4a4a] rounded-xl p-4 border border-transparent hover:border-[#6b9fff] transition-all text-left w-full"
                  >
                    <div className="w-11 h-11 flex items-center justify-center bg-[#5a5a5a] rounded-full text-gray-300 flex-shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-100 truncate">{chat.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Surah {chat.surahNum}:{chat.verseNum} &middot; {chat.messages.length} messages
                      </p>
                    </div>
                    <p className="text-xs text-gray-400 flex-shrink-0">{timeAgo(chat.updatedAt)}</p>
                  </button>
                ))}
              </div>
            )
          )}

        </div>
      </div>
    </>
  );
}
