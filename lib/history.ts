import {
  collection, addDoc, updateDoc, doc, query,
  orderBy, limit, getDocs, serverTimestamp, setDoc, deleteDoc,
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

export interface SavedVerse {
  id: string;
  surahNum: number;
  verseNum: number;
  surahEnglishName: string;
  translation: string;
  savedAt: Date;
  folderId?: string | null;
}

export async function saveVerse(surahNum: number, verseNum: number, surahEnglishName: string, translation: string) {
  const user = auth.currentUser;
  if (!user) return;
  // Use surahNum-verseNum as ID to prevent duplicates
  await setDoc(doc(db, "users", user.uid, "savedVerses", `${surahNum}-${verseNum}`), {
    surahNum, verseNum, surahEnglishName, translation,
    savedAt: serverTimestamp(),
  });
}

export async function unsaveVerse(surahNum: number, verseNum: number) {
  const user = auth.currentUser;
  if (!user) return;
  await deleteDoc(doc(db, "users", user.uid, "savedVerses", `${surahNum}-${verseNum}`));
}

export async function getSavedVerses(): Promise<SavedVerse[]> {
  const user = auth.currentUser;
  if (!user) return [];
  const q = query(collection(db, "users", user.uid, "savedVerses"), orderBy("savedAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<SavedVerse, "id" | "savedAt">),
    savedAt: d.data().savedAt?.toDate() ?? new Date(),
    folderId: d.data().folderId ?? null,
  }));
}

export async function getSavedVerseKeys(): Promise<Set<string>> {
  const user = auth.currentUser;
  if (!user) return new Set();
  const q = query(collection(db, "users", user.uid, "savedVerses"));
  const snap = await getDocs(q);
  return new Set(snap.docs.map((d) => d.id));
}

export async function moveVerseToFolder(verseId: string, folderId: string | null) {
  const user = auth.currentUser;
  if (!user) return;
  await updateDoc(doc(db, "users", user.uid, "savedVerses", verseId), { folderId });
}

// ── Folders ──────────────────────────────────────────────────────────────────

export interface SavedFolder {
  id: string;
  name: string;
  createdAt: Date;
}

export async function createFolder(name: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) return "";
  const ref = await addDoc(collection(db, "users", user.uid, "savedFolders"), {
    name,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getFolders(): Promise<SavedFolder[]> {
  const user = auth.currentUser;
  if (!user) return [];
  const q = query(collection(db, "users", user.uid, "savedFolders"), orderBy("createdAt", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    name: d.data().name,
    createdAt: d.data().createdAt?.toDate() ?? new Date(),
  }));
}

export async function deleteFolder(folderId: string) {
  const user = auth.currentUser;
  if (!user) return;
  await deleteDoc(doc(db, "users", user.uid, "savedFolders", folderId));
  // Move verses out of deleted folder
  const q = query(collection(db, "users", user.uid, "savedVerses"));
  const snap = await getDocs(q);
  const batch = snap.docs.filter((d) => d.data().folderId === folderId);
  await Promise.all(batch.map((d) => updateDoc(d.ref, { folderId: null })));
}

export async function renameFolder(folderId: string, name: string) {
  const user = auth.currentUser;
  if (!user) return;
  await updateDoc(doc(db, "users", user.uid, "savedFolders", folderId), { name });
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

// Fuzzy match: returns true if all characters of `query` appear in `target` in order.
// Also returns true for exact substring matches (handles typos by letter order).
export function fuzzyMatch(target: string, query: string): boolean {
  if (!query) return true;
  const t = target.toLowerCase();
  const q = query.toLowerCase();
  // Exact substring — fast path
  if (t.includes(q)) return true;
  // Sequential character match
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length;
}
