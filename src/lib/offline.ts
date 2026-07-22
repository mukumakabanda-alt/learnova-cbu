// Offline mode for the Study section — a real on-device Library.
//
// Stores a snapshot of a material (its row + flashcards + quiz + the
// actual file bytes) in IndexedDB so it opens with zero network — on the
// bus, in a lecture hall, wherever. The file itself used to NOT be
// cached — only the text (summary/flashcards/quiz) — so a "saved
// offline" document's summary worked with no signal, but tapping to
// actually view the document still silently needed the internet. Now
// the real file is cached alongside everything else, so "Downloaded"
// is an honest promise: it opens, not just its text about it.
//
// Deliberately NOT a full offline sync engine: it's a manual per-
// document snapshot, which is the 90% use case for a student revising,
// without the complexity (and failure modes) of a background sync layer.

import { useEffect, useState } from "react";
import type { Database } from "@/integrations/supabase/types";
import type { MaterialWithCourse } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { fetchFileForOffline } from "@/lib/document-files";

type FlashcardRow = Database["public"]["Tables"]["flashcards"]["Row"];
type QuizRow = Database["public"]["Tables"]["quiz_questions"]["Row"];

export type OfflineBundle = {
  material: MaterialWithCourse;
  flashcards: FlashcardRow[];
  quiz: QuizRow[];
  savedAt: string;
  /** Updated every time this material is actually opened while saved offline — powers the Library's "recently opened" ordering. */
  lastOpenedAt?: string;
  /** The actual file bytes — optional, since older saves (from before this existed) won't have it, and a save can still succeed without it if fetching the file failed (unusually large file, connection dropped mid-fetch). The metadata is worth keeping either way. */
  fileBlob?: Blob;
  fileMime?: string;
};

const DB_NAME = "learnova-offline";
const DB_VERSION = 1;
const STORE = "materials";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB isn't available in this browser."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "material.id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open offline storage."));
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Offline storage operation failed."));
    tx.oncomplete = () => db.close();
  });
}

// A minimal in-memory pub/sub — IndexedDB has no built-in change events,
// so every card anywhere in the app showing a "Downloaded" badge
// (Study catalogue, course page, the Library itself) subscribes via
// useOfflineStatus() below, and every save/remove/clear here calls
// notify() so all of them update instantly, with no page reload and no
// prop-drilling a shared store through the whole app.
type Listener = () => void;
const listeners = new Set<Listener>();
function notify() {
  listeners.forEach((l) => l());
}
function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Object URLs for cached blobs are reused across calls for the same
// material (rather than minting a fresh one every time something asks),
// since they're only released on tab close or explicit revoke.
const objectUrlCache = new Map<string, string>();

export async function saveMaterialOffline(bundle: {
  material: MaterialWithCourse;
  flashcards: FlashcardRow[];
  quiz: QuizRow[];
  fileBlob?: Blob | null;
  fileMime?: string | null;
}): Promise<void> {
  const existing = await getOfflineMaterial(bundle.material.id);
  const full: OfflineBundle = {
    material: bundle.material,
    flashcards: bundle.flashcards,
    quiz: bundle.quiz,
    savedAt: new Date().toISOString(),
    lastOpenedAt: existing?.lastOpenedAt,
    // A re-save that doesn't bring a fresh file (e.g. a metadata-only
    // refresh) keeps whatever was already cached rather than wiping it.
    fileBlob: bundle.fileBlob ?? existing?.fileBlob,
    fileMime: bundle.fileMime ?? existing?.fileMime,
  };
  await withStore("readwrite", (store) => store.put(full));
  notify();
}

// Saves a material for offline use, fetching its current flashcards,
// quiz, AND the file itself fresh — for call sites (a plain Download
// button in a list, say) that don't already have flashcards/quiz loaded
// via useFlashcards/useQuizQuestions. Pass the file if the caller
// already fetched it (e.g. forceDownload() now returns the Blob it
// downloaded) to avoid fetching the same bytes twice — real bandwidth on
// mobile data otherwise. Best-effort throughout: never throws. Whatever
// download this is paired with has already succeeded by the time it's
// called — failing to ALSO cache it offline is a missed bonus, not
// something that should surface as an error on top of a successful
// download.
export async function saveMaterialOfflineFromDownload(
  material: MaterialWithCourse,
  file?: { blob: Blob; mime: string } | null,
): Promise<void> {
  try {
    const [{ data: flashcards }, { data: quiz }, fetchedFile] = await Promise.all([
      supabase.from("flashcards").select("*").eq("material_id", material.id),
      supabase.from("quiz_questions").select("*").eq("material_id", material.id),
      file ? Promise.resolve(file) : material.file_path ? fetchFileForOffline(material.file_path) : Promise.resolve(null),
    ]);
    await saveMaterialOffline({
      material,
      flashcards: flashcards ?? [],
      quiz: quiz ?? [],
      fileBlob: fetchedFile?.blob,
      fileMime: fetchedFile?.mime,
    });
  } catch (e) {
    console.error("Couldn't cache this material for offline use after download:", e);
  }
}

export async function getOfflineMaterial(id: string): Promise<OfflineBundle | null> {
  try {
    const result = await withStore<OfflineBundle | undefined>("readonly", (store) => store.get(id));
    return result ?? null;
  } catch {
    return null;
  }
}

export async function isSavedOffline(id: string): Promise<boolean> {
  return (await getOfflineMaterial(id)) !== null;
}

export async function removeOfflineMaterial(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
  const url = objectUrlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    objectUrlCache.delete(id);
  }
  notify();
}

export async function clearAllOffline(): Promise<void> {
  await withStore("readwrite", (store) => store.clear());
  objectUrlCache.forEach((url) => URL.revokeObjectURL(url));
  objectUrlCache.clear();
  notify();
}

export async function listOfflineMaterials(): Promise<OfflineBundle[]> {
  try {
    const result = await withStore<OfflineBundle[]>("readonly", (store) => store.getAll());
    return result ?? [];
  } catch {
    return [];
  }
}

// Records that a saved-offline material was actually opened — a no-op if
// it isn't saved offline. Powers the Library's "recently opened"
// ordering, the closest thing to Spotify's "Recently played" this
// feature area has.
export async function touchLastOpened(id: string): Promise<void> {
  try {
    const existing = await getOfflineMaterial(id);
    if (!existing) return;
    await withStore("readwrite", (store) => store.put({ ...existing, lastOpenedAt: new Date().toISOString() }));
    notify();
  } catch {
    // Not being able to update a "last opened" timestamp is never worth surfacing as an error.
  }
}

// A same-origin URL for a material's cached file, if one exists — null
// if it isn't saved offline, or was saved before file-caching existed,
// or the file was too large / the connection dropped when it was cached.
export async function getOfflineFileUrl(id: string): Promise<{ url: string; mime: string } | null> {
  const bundle = await getOfflineMaterial(id);
  if (!bundle?.fileBlob) return null;
  let url = objectUrlCache.get(id);
  if (!url) {
    url = URL.createObjectURL(bundle.fileBlob);
    objectUrlCache.set(id, url);
  }
  return { url, mime: bundle.fileMime || bundle.fileBlob.type || "" };
}

/** Real numbers, not a guess: how many materials are cached and how much device storage they're actually using. */
export async function offlineStorageStats(): Promise<{ count: number; bytes: number; filesCount: number }> {
  const all = await listOfflineMaterials();
  const bytes = all.reduce((sum, b) => sum + (b.fileBlob?.size ?? 0), 0);
  const filesCount = all.filter((b) => !!b.fileBlob).length;
  return { count: all.length, bytes, filesCount };
}

/**
 * Real numbers from the browser itself — total storage quota granted to
 * this site's origin, and how much of it is currently in use. This
 * covers everything the browser counts for the origin (not just
 * materials cached here), so it's a different number from
 * offlineStorageStats() above rather than a replacement for it — shown
 * as its own line on the offline page. Returns null wherever the API
 * isn't available (older browsers, some private-browsing modes) — the
 * page hides the line entirely rather than showing a placeholder.
 */
export async function deviceStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
    const { usage, quota } = await navigator.storage.estimate();
    if (usage == null || quota == null) return null;
    return { usage, quota };
  } catch {
    return null;
  }
}

/** True/false, live-updating as the browser goes on/offline. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}

/**
 * Live "is this Downloaded?" status for one material — reactive to
 * saves/removals anywhere in the app via the pub/sub above, so a card in
 * the Study catalogue and the same material's row in the Library update
 * in the same instant, with no reload. This is what every "Downloaded"
 * badge in the app reads from.
 */
export function useOfflineStatus(materialId: string): { downloaded: boolean; hasFile: boolean; loading: boolean } {
  const [state, setState] = useState<{ downloaded: boolean; hasFile: boolean; loading: boolean }>({
    downloaded: false,
    hasFile: false,
    loading: true,
  });

  useEffect(() => {
    if (!materialId) {
      setState({ downloaded: false, hasFile: false, loading: false });
      return;
    }
    let active = true;
    function refresh() {
      getOfflineMaterial(materialId).then((bundle) => {
        if (!active) return;
        setState({ downloaded: !!bundle, hasFile: !!bundle?.fileBlob, loading: false });
      });
    }
    refresh();
    const unsubscribe = subscribe(refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [materialId]);

  return state;
}

// Powers the homepage's "Continue studying," Browse's "Recently opened,"
// and the offline library page — same IndexedDB store as everything
// above, sorted by whichever is more recent: the last time it was
// actually opened, or (saved but never reopened) when it was saved.
// Reactive via the same subscribe/notify pub-sub as useOfflineStatus, so
// downloading or removing something on any page updates every other page
// reading this, with no manual refresh and no stale list left behind.
export function useOfflineLibrary(limit?: number): { items: OfflineBundle[]; loading: boolean } {
  const [state, setState] = useState<{ items: OfflineBundle[]; loading: boolean }>({ items: [], loading: true });

  useEffect(() => {
    let active = true;
    function refresh() {
      listOfflineMaterials().then((all) => {
        if (!active) return;
        const sorted = [...all].sort(
          (a, b) => new Date(b.lastOpenedAt ?? b.savedAt).getTime() - new Date(a.lastOpenedAt ?? a.savedAt).getTime(),
        );
        setState({ items: limit ? sorted.slice(0, limit) : sorted, loading: false });
      });
    }
    refresh();
    const unsubscribe = subscribe(refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [limit]);

  return state;
}
