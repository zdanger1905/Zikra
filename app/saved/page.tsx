"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  getSavedVerses, unsaveVerse, moveVerseToFolder,
  getFolders, createFolder, deleteFolder, renameFolder,
  timeAgo, type SavedVerse, type SavedFolder,
} from "@/lib/history";

export default function SavedPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [verses, setVerses] = useState<SavedVerse[]>([]);
  const [folders, setFolders] = useState<SavedFolder[]>([]);
  const [loading, setLoading] = useState(true);

  // View: null = all verses, string = folder id
  const [openFolder, setOpenFolder] = useState<string | null>(null);

  // Create folder modal
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // Move verse modal
  const [movingVerse, setMovingVerse] = useState<SavedVerse | null>(null);

  // Rename folder
  const [renamingFolder, setRenamingFolder] = useState<SavedFolder | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingFolder, setDeletingFolder] = useState<SavedFolder | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        Promise.all([getSavedVerses(), getFolders()]).then(([v, f]) => {
          setVerses(v); setFolders(f); setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });
  }, []);

  if (user === undefined) return null;

  if (!user) {
    return (
      <div className="min-h-screen bg-[#3d3d3d] flex items-center justify-center">
        <p className="text-gray-400 text-sm">Please log in to view your saved verses.</p>
      </div>
    );
  }

  const unfiledVerses = verses.filter((v) => !v.folderId);
  const folderVerses = (folderId: string) => verses.filter((v) => v.folderId === folderId);
  const displayVerses = openFolder === null ? unfiledVerses : folderVerses(openFolder);
  const currentFolder = folders.find((f) => f.id === openFolder) ?? null;

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    const id = await createFolder(name);
    setFolders((prev) => [...prev, { id, name, createdAt: new Date() }]);
    setNewFolderName("");
    setCreatingFolder(false);
  }

  async function handleDeleteFolder(f: SavedFolder) {
    await deleteFolder(f.id);
    setFolders((prev) => prev.filter((x) => x.id !== f.id));
    setVerses((prev) => prev.map((v) => v.folderId === f.id ? { ...v, folderId: null } : v));
    if (openFolder === f.id) setOpenFolder(null);
  }

  async function handleRenameFolder() {
    if (!renamingFolder) return;
    const name = renameValue.trim();
    if (!name) return;
    await renameFolder(renamingFolder.id, name);
    setFolders((prev) => prev.map((f) => f.id === renamingFolder.id ? { ...f, name } : f));
    setRenamingFolder(null);
  }

  async function handleMove(verse: SavedVerse, folderId: string | null) {
    await moveVerseToFolder(verse.id, folderId);
    setVerses((prev) => prev.map((v) => v.id === verse.id ? { ...v, folderId } : v));
    setMovingVerse(null);
  }

  async function handleUnsave(verse: SavedVerse) {
    await unsaveVerse(verse.surahNum, verse.verseNum);
    setVerses((prev) => prev.filter((v) => v.id !== verse.id));
  }

  return (
    <div className="min-h-screen bg-[#3d3d3d]">
      {/* Delete folder confirmation */}
      {deletingFolder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setDeletingFolder(null); }}>
          <div className="bg-[#1e1e1e] rounded-2xl border border-[#333] shadow-2xl w-80 p-6 space-y-4">
            <p className="text-white font-semibold text-sm">Delete &ldquo;{deletingFolder.name}&rdquo;?</p>
            <p className="text-gray-400 text-xs">Verses inside will be moved to unfiled. This cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeletingFolder(null)}
                className="flex-1 py-2 rounded-xl border border-[#444] text-gray-400 text-sm hover:bg-[#2a2a2a] transition-colors">
                Cancel
              </button>
              <button onClick={() => { handleDeleteFolder(deletingFolder); setDeletingFolder(null); }}
                className="flex-1 py-2 rounded-xl bg-red-700 hover:bg-red-600 text-white text-sm font-semibold transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move verse modal */}
      {movingVerse && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setMovingVerse(null); }}>
          <div className="bg-[#1e1e1e] rounded-2xl border border-[#333] shadow-2xl w-80 p-6 space-y-3">
            <p className="text-white font-semibold text-sm mb-1">Move to folder</p>
            <button onClick={() => handleMove(movingVerse, null)}
              className="w-full text-left px-4 py-2.5 rounded-xl bg-[#2a2a2a] text-gray-300 text-sm hover:bg-[#333] transition-colors">
              No folder (unfiled)
            </button>
            {folders.map((f) => (
              <button key={f.id} onClick={() => handleMove(movingVerse, f.id)}
                className="w-full text-left px-4 py-2.5 rounded-xl bg-[#2a2a2a] text-gray-300 text-sm hover:bg-[#333] transition-colors">
                {f.name}
              </button>
            ))}
            <button onClick={() => setMovingVerse(null)}
              className="w-full py-2 rounded-xl border border-[#444] text-gray-500 text-sm hover:bg-[#2a2a2a] transition-colors mt-1">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Create folder modal */}
      {creatingFolder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setCreatingFolder(false); }}>
          <div className="bg-[#1e1e1e] rounded-2xl border border-[#333] shadow-2xl w-80 p-6 space-y-3">
            <p className="text-white font-semibold text-sm">New folder</p>
            <input
              autoFocus
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); if (e.key === "Escape") setCreatingFolder(false); }}
              placeholder="Folder name"
              className="w-full px-4 py-2.5 rounded-xl bg-[#2a2a2a] border border-[#444] text-gray-100 text-sm placeholder:text-gray-600 focus:outline-none focus:border-[#6b9fff] transition-colors"
            />
            <div className="flex gap-2">
              <button onClick={() => setCreatingFolder(false)}
                className="flex-1 py-2 rounded-xl border border-[#444] text-gray-400 text-sm hover:bg-[#2a2a2a] transition-colors">
                Cancel
              </button>
              <button onClick={handleCreateFolder}
                className="flex-1 py-2 rounded-xl bg-[#6b9fff] hover:bg-[#5a8eee] text-white text-sm font-semibold transition-colors">
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename folder modal */}
      {renamingFolder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setRenamingFolder(null); }}>
          <div className="bg-[#1e1e1e] rounded-2xl border border-[#333] shadow-2xl w-80 p-6 space-y-3">
            <p className="text-white font-semibold text-sm">Rename folder</p>
            <input
              autoFocus
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleRenameFolder(); if (e.key === "Escape") setRenamingFolder(null); }}
              className="w-full px-4 py-2.5 rounded-xl bg-[#2a2a2a] border border-[#444] text-gray-100 text-sm focus:outline-none focus:border-[#6b9fff] transition-colors"
            />
            <div className="flex gap-2">
              <button onClick={() => setRenamingFolder(null)}
                className="flex-1 py-2 rounded-xl border border-[#444] text-gray-400 text-sm hover:bg-[#2a2a2a] transition-colors">
                Cancel
              </button>
              <button onClick={handleRenameFolder}
                className="flex-1 py-2 rounded-xl bg-[#6b9fff] hover:bg-[#5a8eee] text-white text-sm font-semibold transition-colors">
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            {openFolder ? (
              <div className="flex items-center gap-2">
                <button onClick={() => setOpenFolder(null)} className="text-gray-400 hover:text-white transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5M12 5l-7 7 7 7"/>
                  </svg>
                </button>
                <h1 className="text-2xl font-bold text-white">{currentFolder?.name}</h1>
              </div>
            ) : (
              <h1 className="text-3xl font-bold text-white">Saved Verses</h1>
            )}
            <p className="text-gray-400 text-sm mt-1">
              {openFolder ? `${displayVerses.length} verse${displayVerses.length !== 1 ? "s" : ""}` : "Your bookmarked verses"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {openFolder && currentFolder && (
              <>
                <button onClick={() => { setRenamingFolder(currentFolder); setRenameValue(currentFolder.name); }}
                  className="text-xs text-gray-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-[#444] hover:border-[#666]">
                  Rename
                </button>
                <button onClick={() => setDeletingFolder(currentFolder)}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors px-3 py-1.5 rounded-lg border border-red-900 hover:border-red-700">
                  Delete folder
                </button>
              </>
            )}
            {!openFolder && (
              <button onClick={() => setCreatingFolder(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#4a4a4a] border border-[#555] text-gray-300 text-xs hover:bg-[#555] hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  <line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>
                </svg>
                New folder
              </button>
            )}
          </div>
        </div>

        {loading && (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 border-4 border-gray-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && !openFolder && (
          <>
            {/* Folders */}
            {folders.length > 0 && (
              <div className="grid grid-cols-2 gap-2 mb-6">
                {folders.map((f) => (
                  <button key={f.id} onClick={() => setOpenFolder(f.id)}
                    className="flex items-center gap-3 bg-[#4a4a4a] rounded-xl p-4 border border-transparent hover:border-[#6b9fff] transition-all text-left"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#6b9fff] flex-shrink-0">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                    <div className="min-w-0">
                      <p className="text-gray-100 text-sm font-medium truncate">{f.name}</p>
                      <p className="text-gray-500 text-xs">{folderVerses(f.id).length} verses</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Unfiled verses label */}
            {folders.length > 0 && unfiledVerses.length > 0 && (
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">Unfiled</p>
            )}
          </>
        )}

        {/* Verses list */}
        {!loading && (
          displayVerses.length === 0 ? (
            <p className="text-center text-gray-500 py-16">
              {openFolder ? "No verses in this folder yet." : "No saved verses yet. Tap the ribbon icon on any verse to save it."}
            </p>
          ) : (
            <div className="grid gap-2">
              {displayVerses.map((v) => (
                <div key={v.id}
                  className="flex items-center gap-4 bg-[#4a4a4a] rounded-xl p-4 border border-transparent hover:border-[#6b9fff] transition-all group"
                >
                  <button onClick={() => router.push(`/quran/${v.surahNum}?verse=${v.verseNum}`)}
                    className="flex items-center justify-center bg-[#5a5a5a] rounded-xl px-3 py-2 flex-shrink-0">
                    <span className="text-[#6b9fff] font-bold text-sm">{v.surahNum}:{v.verseNum}</span>
                  </button>
                  <button onClick={() => router.push(`/quran/${v.surahNum}?verse=${v.verseNum}`)}
                    className="flex-1 min-w-0 text-left">
                    <p className="font-semibold text-gray-100 text-sm">{v.surahEnglishName}</p>
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{v.translation}</p>
                  </button>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <p className="text-xs text-gray-400">{timeAgo(v.savedAt)}</p>
                    <div className="flex items-center gap-2">
                      {/* Move to folder */}
                      <button onClick={() => setMovingVerse(v)} title="Move to folder"
                        className="text-gray-500 hover:text-[#6b9fff] transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                        </svg>
                      </button>
                      {/* Unsave */}
                      <button onClick={() => handleUnsave(v)} title="Remove"
                        className="text-gray-500 hover:text-red-400 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
