// Lightweight offline mode for the Study section.
//
// Stores a snapshot of a material (its row + flashcards + quiz questions)
// in IndexedDB so it can be opened with zero network — on the bus, in a
// lecture hall with no signal, wherever. Deliberately NOT a full offline
// sync engine: it's a manual "Save for offline" snapshot per document,
// which is the 90% use case for a student revising, without the
// complexity (and failure modes) of a background sync layer.
//
// Browser storage note: this uses IndexedDB, not localStorage/sessionStorage
// — IndexedDB handles larger payloads (a document's flashcards + quiz +
// summary) reliably and asynchronously, which localStorage's synchronous,
// ~5MB, string-only API isn't built for.

import { useEffect, useState } from "react";
import type { Database } from "@/integrations/supabase/types";
import type { MaterialWithCourse } from "@/lib/queries";

type FlashcardRow = Database["public"]["Tables"]["flashcards"]["Row"];
type QuizRow = Database["public"]["Tables"]["quiz_questions"]["Row"];

export type OfflineBundle = {
  material: MaterialWithCourse;
  flashcards: FlashcardRow[];
  quiz: QuizRow[];
  savedAt: string;
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

export async function saveMaterialOffline(bundle: Omit<OfflineBundle, "savedAt">): Promise<void> {
  const full: OfflineBundle = { ...bundle, savedAt: new Date().toISOString() };
  await withStore("readwrite", (store) => store.put(full));
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
}

export async function listOfflineMaterials(): Promise<OfflineBundle[]> {
  try {
    const result = await withStore<OfflineBundle[]>("readonly", (store) => store.getAll());
    return result ?? [];
  } catch {
    return [];
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
