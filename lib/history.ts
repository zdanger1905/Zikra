import {
  collection, addDoc, updateDoc, doc, query,
  orderBy, limit, getDocs, serverTimestamp, setDoc,
} from "firebase/firestore";
import { db, auth } from "./firebase";

export interface QuranVisit {
  id: string;
  surahNum: number;
  surahName: string;
  surahEnglishName: string;
  visitedAt: Date;
}

export interface AIChat {
  id: string;
  surahNum: number;
  verseNum: number;
  verseText: string;
  arabicText: string;
  title: string;
  messages: { role: string; content: string }[];
  createdAt: Date;
  updatedAt: Date;
}

export async function recordSurahVisit(surahNum: number, surahName: string, surahEnglishName: string) {
  const user = auth.currentUser;
  if (!user) return;
  // Use surahNum as doc ID so revisiting the same surah just updates the timestamp
  await setDoc(doc(db, "users", user.uid, "quranHistory", String(surahNum)), {
    surahNum,
    surahName,
    surahEnglishName,
    visitedAt: serverTimestamp(),
  });
}

export async function getQuranHistory(): Promise<QuranVisit[]> {
  const user = auth.currentUser;
  if (!user) return [];
  const q = query(
    collection(db, "users", user.uid, "quranHistory"),
    orderBy("visitedAt", "desc"),
    limit(30)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<QuranVisit, "id" | "visitedAt">),
    visitedAt: d.data().visitedAt?.toDate() ?? new Date(),
  }));
}

export async function createAIChat(
  surahNum: number,
  verseNum: number,
  verseText: string,
  arabicText: string,
  messages: { role: string; content: string }[]
): Promise<string> {
  const user = auth.currentUser;
  if (!user) return "";
  const title = messages.find((m) => m.role === "user")?.content ?? "Chat";
  const ref = await addDoc(collection(db, "users", user.uid, "aiChats"), {
    surahNum,
    verseNum,
    verseText,
    arabicText,
    title,
    messages,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateAIChat(chatId: string, messages: { role: string; content: string }[]) {
  const user = auth.currentUser;
  if (!user) return;
  await updateDoc(doc(db, "users", user.uid, "aiChats", chatId), {
    messages,
    updatedAt: serverTimestamp(),
  });
}

export async function getAIChats(): Promise<AIChat[]> {
  const user = auth.currentUser;
  if (!user) return [];
  const q = query(
    collection(db, "users", user.uid, "aiChats"),
    orderBy("updatedAt", "desc"),
    limit(50)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<AIChat, "id" | "createdAt" | "updatedAt">),
    createdAt: d.data().createdAt?.toDate() ?? new Date(),
    updatedAt: d.data().updatedAt?.toDate() ?? new Date(),
  }));
}

export function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}
