"use client";

import { useState, useRef, useEffect } from "react";
import { auth } from "@/lib/firebase";
import { createAIChat, updateAIChat } from "@/lib/history";
import ReactMarkdown from "react-markdown";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AskAIModalProps {
  surahNum: number;
  verseNum: number;
  verseText: string;
  arabicText: string;
  onClose: () => void;
  initialMessages?: Message[];
  chatId?: string;
}

const RECENTS_KEY = "zikra_recent_questions";
const MAX_RECENTS = 3;

function loadRecents(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]"); } catch { return []; }
}

function saveRecent(q: string) {
  const prev = loadRecents().filter((r) => r !== q);
  localStorage.setItem(RECENTS_KEY, JSON.stringify([q, ...prev].slice(0, MAX_RECENTS)));
}

export default function AskAIModal({
  surahNum, verseNum, verseText, arabicText, onClose,
  initialMessages, chatId: existingChatId,
}: AskAIModalProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages ?? []);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const chatIdRef = useRef<string | null>(existingChatId ?? null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setRecents(loadRecents()); }, []);

  useEffect(() => {
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      textareaRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distFromBottom < 80) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    sendQuestion(input.trim());
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  function handleTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendQuestion(input.trim());
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    }
  }

  async function sendQuestion(q: string) {
    if (!q || loading) return;
    setInput("");
    saveRecent(q);
    setRecents(loadRecents());

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

      // Save to Firestore if user is logged in
      const user = auth.currentUser;
      if (user) {
        const finalMessages = [
          ...newMessages,
          { role: "assistant" as const, content: assistantText },
        ];
        if (!chatIdRef.current) {
          chatIdRef.current = await createAIChat(surahNum, verseNum, verseText, arabicText, finalMessages);
        } else {
          await updateAIChat(chatIdRef.current, finalMessages);
        }
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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 md:backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="relative bg-[#1e1e1e] flex flex-col w-full h-full md:w-[500px] md:max-w-[92vw] md:h-[75vh] md:rounded-2xl md:border md:border-[#333] md:shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#333] flex-shrink-0">
          <div>
            <p className="text-white font-serif text-lg tracking-wide">Ask about this verse</p>
            <p className="text-gray-500 text-xs mt-0.5">Surah {surahNum}:{verseNum}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-200 transition-colors" aria-label="Close">
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
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col gap-4 mt-2">
              <div className="flex gap-4">
                {/* FAQ */}
                <div className="flex-1 min-w-0">
                  <p className="text-gray-500 text-xs font-medium mb-2">FAQ</p>
                  <div className="flex flex-col gap-2">
                    {[
                      "What is the historical context?",
                      "Differences in opinion?",
                      "Simplify this.",
                    ].map((q) => (
                      <button
                        key={q}
                        onClick={() => sendQuestion(q)}
                        disabled={loading}
                        className="text-left px-3 py-1.5 rounded-lg border border-[#444] bg-[#2a2a2a] text-gray-300 text-xs hover:bg-[#333] hover:border-[#555] transition-colors disabled:opacity-40"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Recents */}
                <div className="flex-1 min-w-0">
                  <p className="text-gray-500 text-xs font-medium mb-2">Recents</p>
                  <div className="flex flex-col gap-2">
                    {recents.length === 0 ? (
                      <p className="text-gray-600 text-xs">No recent questions.</p>
                    ) : recents.map((q) => (
                      <button
                        key={q}
                        onClick={() => sendQuestion(q)}
                        disabled={loading}
                        className="text-left px-3 py-1.5 rounded-lg border border-[#444] bg-[#2a2a2a] text-gray-300 text-xs hover:bg-[#333] hover:border-[#555] transition-colors disabled:opacity-40 truncate"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <p className="text-gray-600 text-sm text-center mt-3">
                Ask anything about this verse — its meaning, context, or related teachings.
              </p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-[#6b9fff] text-white rounded-br-sm whitespace-pre-wrap"
                  : "bg-[#2a2a2a] text-gray-300 font-light rounded-bl-sm"
              }`}>
                {msg.role === "assistant" ? (
                  msg.content ? (
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                        strong: ({ children }) => <strong className="font-bold text-white">{children}</strong>,
                        h2: ({ children }) => <p className="font-semibold text-white mb-1">{children}</p>,
                        h3: ({ children }) => <p className="font-semibold text-gray-300 mb-1">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                        li: ({ children }) => <li>{children}</li>,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  ) : (
                    <span className="flex gap-1 items-center py-1">
                      <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </span>
                  )
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSend} className="px-6 py-4 border-t border-[#333] flex gap-3 flex-shrink-0">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleTextareaKeyDown}
            placeholder="Ask a question…"
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl bg-[#2a2a2a] border border-[#444] text-gray-100 text-sm placeholder:text-gray-600 focus:outline-none focus:border-[#6b9fff] transition-colors disabled:opacity-50 resize-none overflow-y-auto leading-5"
            style={{ maxHeight: "calc(4 * 1.25rem + 2 * 0.625rem)" }}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="self-end px-3 py-2.5 rounded-xl bg-[#6b9fff] hover:bg-[#5a8eee] text-white transition-colors disabled:opacity-40 flex-shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M3.478 2.405a.75.75 0 0 0-.926.94l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.405Z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
