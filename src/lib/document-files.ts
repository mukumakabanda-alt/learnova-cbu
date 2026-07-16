// Shared file-handling helpers for uploaded material documents.
//
// Every place in the app that lets someone view or download a material's
// underlying file (StudyPanel, the course page, the study catalogue, the
// dashboard) used to carry its own copy of this logic, and they'd drifted
// out of sync — one of them (the course page) opened a popup *after* an
// `await`, which mobile browsers silently block, which is exactly what
// "I tap it and nothing happens" looks like. Centralising it here means
// view/download behave identically everywhere, and there's one place to
// fix it if Storage's behaviour ever changes.

import { supabase } from "@/integrations/supabase/client";

// Uploads are stored at `${userId}/${crypto.randomUUID()}-${originalName}`.
// A v4 UUID is always exactly 36 characters, so everything after that
// (plus the separating hyphen) is the real original filename — used so a
// forced download saves as "Macro Notes Week 3.pdf" instead of a bare
// UUID with no extension a person can't recognise in their Downloads folder.
export function originalFileName(filePath: string, fallbackTitle: string): string {
  const base = filePath.split("/").pop() ?? "";
  const name = base.length > 37 ? base.slice(37) : base;
  return name || fallbackTitle;
}

function fileExtension(filePath: string): string {
  const name = filePath.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

export type PreviewKind = "pdf" | "image" | "text" | "office" | "none";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"]);
const TEXT_EXTS = new Set(["txt", "md", "csv", "json", "log"]);
const OFFICE_EXTS = new Set(["doc", "docx", "ppt", "pptx", "xls", "xlsx", "rtf"]);

const MIME_TO_EXTENSION: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
  "image/heic": "heic",
  "image/heif": "heif",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/csv": "csv",
  "application/json": "json",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/rtf": "rtf",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
};

// Identifies a file from its first bytes ("magic numbers") — the actual
// format signature every real file format writes at its start,
// regardless of what any browser reported for its name or MIME type.
// Last-resort fallback, for the case a file has neither a usable
// extension NOR a usable MIME type — no dot in its stored filename, AND
// Storage recorded it as a generic type like application/octet-stream
// because the browser couldn't detect one at upload time either. Both
// do happen for files saved via WhatsApp on Android.
function kindFromMagicBytes(bytes: Uint8Array): PreviewKind {
  const b = (n: number) => bytes[n] ?? -1;
  if (b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46) return "pdf"; // %PDF
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image"; // JPEG
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return "image"; // PNG
  if (b(0) === 0x47 && b(1) === 0x49 && b(2) === 0x46) return "image"; // GIF
  if (b(0) === 0x42 && b(1) === 0x4d) return "image"; // BMP
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46) return "image"; // RIFF container — WEBP, in this app's context
  if (b(0) === 0x50 && b(1) === 0x4b && (b(2) === 0x03 || b(2) === 0x05 || b(2) === 0x07)) return "office"; // ZIP-based: docx/pptx/xlsx
  return "none";
}

/** Reads a local File's first bytes and identifies its real type directly — no network needed, used at upload time. See kindFromMagicBytes above. */
export async function sniffLocalFileKind(file: File | Blob): Promise<PreviewKind> {
  try {
    const buffer = await file.slice(0, 16).arrayBuffer();
    return kindFromMagicBytes(new Uint8Array(buffer));
  } catch {
    return "none";
  }
}

/** A tiny Range request against a signed URL — reads only the first 16 bytes, never the whole file. Final fallback when a stored file has neither a usable extension nor a usable Content-Type. See kindFromMagicBytes above. */
export async function sniffFileSignature(url: string): Promise<PreviewKind> {
  try {
    const response = await fetch(url, { headers: { Range: "bytes=0-15" } });
    const buffer = await response.arrayBuffer();
    return kindFromMagicBytes(new Uint8Array(buffer));
  } catch {
    return "none";
  }
}

const KIND_TO_EXTENSION: Record<Exclude<PreviewKind, "none">, string> = {
  pdf: "pdf",
  image: "jpg",
  office: "zip", // a bare ZIP signature could be docx/pptx/xlsx/zip — "zip" is an honest default when we can't tell which specifically
  text: "txt",
};

// Ensures a filename ends in a real extension. Tries, in order: the
// filename's own extension (if it already has one) → the file's MIME
// type → the file's own first bytes directly. That third step is what's
// new — without it, a file whose browser-reported MIME type was ALSO
// blank (not just its filename) still got stored with a path like
// ".../a1b2c3-360773" — no dot anywhere, and no useful Content-Type to
// fall back on later either — which is exactly what "no inline preview"
// for a totally normal file turns out to be.
export async function ensureFileExtension(filename: string, file: File): Promise<string> {
  if (/\.[a-zA-Z0-9]{1,8}$/.test(filename)) return filename;

  const fromMime = MIME_TO_EXTENSION[file.type.split(";")[0].trim().toLowerCase()];
  if (fromMime) return `${filename}.${fromMime}`;

  const sniffed = await sniffLocalFileKind(file);
  if (sniffed !== "none") return `${filename}.${KIND_TO_EXTENSION[sniffed]}`;

  return filename;
}

// Decides how the in-website viewer should render a file. PDFs and images
// render natively in the browser; Office formats have no native in-browser
// renderer, so they go through Google's document viewer instead (it just
// needs a URL it can fetch — our signed URL works fine for that). Anything
// else (zips, unknown formats) has no safe inline preview, so the viewer
// falls back to a plain "download to open" message.
export function previewKind(filePath: string): PreviewKind {
  const ext = fileExtension(filePath);
  if (ext === "pdf") return "pdf";
  if (IMAGE_EXTS.has(ext)) return "image";
  if (TEXT_EXTS.has(ext)) return "text";
  if (OFFICE_EXTS.has(ext)) return "office";
  return "none";
}

// Fallback for previewKind() when the stored path has no recognizable
// extension. Used both for a live Content-Type sniff (see
// sniffContentType below) and for a cached offline blob's own .type —
// same function either way.
export function previewKindFromMime(mime: string | null): PreviewKind {
  if (!mime) return "none";
  const type = mime.split(";")[0].trim().toLowerCase();
  if (type === "application/pdf") return "pdf";
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("text/")) return "text";
  if (
    type === "application/msword" ||
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    type === "application/vnd.ms-powerpoint" ||
    type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    type === "application/vnd.ms-excel" ||
    type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    type === "application/rtf"
  ) {
    return "office";
  }
  return "none";
}

// A lightweight HEAD request against a signed URL, used only to read
// back the Content-Type Storage recorded for the file — never downloads
// the body. See previewKindFromMime() above.
export async function sniffContentType(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.headers.get("content-type");
  } catch {
    return null;
  }
}

// A signed URL good for an hour. The old 60-second expiry was a real bug:
// PDF viewers and Office's online viewer both make several follow-up
// range requests to actually load a document rather than one single
// request, and on a slow connection those can easily land after the
// first 60 seconds — at which point the link had already expired and
// loading just silently stalled. An hour is still tightly scoped to one
// viewing session, just not so tight it breaks on ordinary mobile data.
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function getViewUrl(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from("materials").createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data) throw error ?? new Error("Couldn't create a link for that file.");
  return data.signedUrl;
}

async function getDownloadUrl(filePath: string, filename: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("materials")
    .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS, { download: filename });
  if (error || !data) throw error ?? new Error("Couldn't create a download link for that file.");
  return data.signedUrl;
}

// Fetches a material's file into memory as a Blob without triggering a
// save-to-device download — used to cache the file for offline viewing
// (see offline.ts) independently of whether the person has also tapped
// the separate Download button. Returns null rather than throwing on
// failure (unusually large file, connection dropped mid-fetch) — caching
// the file for offline use is a bonus on top of the material's already-
// saved metadata/summary/flashcards/quiz; it shouldn't block or fail
// that.
export async function fetchFileForOffline(filePath: string): Promise<{ blob: Blob; mime: string } | null> {
  try {
    const url = await getViewUrl(filePath);
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return { blob, mime: blob.type || response.headers.get("content-type") || "" };
  } catch {
    return null;
  }
}

// Forces an actual save-to-device download (never an inline preview),
// and returns the downloaded Blob so a caller can also cache it for
// offline use (see saveMaterialOfflineFromDownload in offline.ts)
// without fetching the same bytes twice — real bandwidth on mobile data
// otherwise.
//
// This fetches the file into memory first and downloads from a same-
// origin blob: URL, rather than pointing an anchor straight at the
// (cross-origin) Storage URL. A plain cross-origin anchor click is what
// a number of mobile browsers — Safari on iOS in particular, and
// Android in-app browsers like WhatsApp/Facebook/Instagram's built-in
// browser — quietly turn into "just open/navigate to the file" instead
// of a real download, no matter what the `download` attribute or the
// signed URL's Content-Disposition header say. Downloading the bytes
// first and handing the browser a blob: URL (always same-origin, always
// local) is what makes the save-to-device behaviour reliable everywhere
// — this is what "I can't download" on a phone almost always turns out
// to actually be.
export async function forceDownload(filePath: string, fallbackTitle: string): Promise<Blob> {
  const filename = originalFileName(filePath, fallbackTitle);
  const url = await getDownloadUrl(filePath, filename);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Couldn't fetch the file (status ${response.status}).`);
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);

  try {
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Revoking immediately can race the browser actually starting to
    // read the blob on some devices, so this waits a few seconds first.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
  }

  return blob;
}
