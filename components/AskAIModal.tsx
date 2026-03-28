"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AskAIModalProps {
  surahNum: number;
  verseNum: number;
  verseText: string;       // translation text
  arabicText: string;
  onClose: () => void;
}

export default function AskAIModal({ surahNum, verseNum, verseText, arabicText, onClose }: AskAIModalProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || loading) return;
    setInput("");

    const newMessages: Message[] = [...messages, { role: "user", content: q }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          verseContext: `Surah ${surahNum}, Verse ${verseNum}\nArabic: ${arabicText}\nTranslation: ${verseText}`,
        }),
      });

      if (!res.ok) throw new Error("API error");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        assistantText += decoder.decode(value, { stream: true });
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: "assistant", content: assistantText },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="relative w-[500px] max-w-[92vw] bg-[#1e1e1e] rounded-2xl shadow-2xl border border-[#333] flex flex-col" style={{ height: "75vh" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#333] flex-shrink-0">
          <div>
            <p className="text-white font-serif text-lg tracking-wide">Ask about this verse</p>
            <p className="text-gray-500 text-xs mt-0.5">Surah {surahNum}:{verseNum}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-200 transition-colors"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Verse preview */}
        <div className="px-6 py-3 bg-[#252525] border-b border-[#333] flex-shrink-0">
          <p className="text-gray-400 text-xs leading-relaxed line-clamp-2">{verseText}</p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.length === 0 && (
            <p className="text-gray-600 text-sm text-center mt-8">
              Ask anything about this verse — its meaning, context, or related teachings.
            </p>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-[#6b9fff] text-white rounded-br-sm"
                    : "bg-[#2a2a2a] text-gray-200 rounded-bl-sm"
                }`}
              >
                {msg.content || (
                  <span className="flex gap-1 items-center py-1">
                    <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSend} className="px-6 py-4 border-t border-[#333] flex gap-3 flex-shrink-0">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question…"
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl bg-[#2a2a2a] border border-[#444] text-gray-100 text-sm placeholder:text-gray-600 focus:outline-none focus:border-[#6b9fff] transition-colors disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-4 py-2.5 rounded-xl bg-[#6b9fff] hover:bg-[#5a8eee] text-white text-sm font-semibold transition-colors disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
