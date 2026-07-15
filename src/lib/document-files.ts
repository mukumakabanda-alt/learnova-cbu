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

// Maps a MIME type to the extension this app would give a file of that
// type — used in two places: ensureFileExtension() below, to give a
// proper extension to files whose original name had none at all (very
// common for photos/documents saved via WhatsApp on Android, which
// frequently strips it entirely); and previewKindFromMime() further
// down, as a fallback for files that were already stored that way
// before this existed.
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

// Ensures a filename ends in a real extension, inferring one from its
// MIME type when it doesn't already have one. Without this, a file saved
// via WhatsApp on Android (which often strips the extension entirely)
// got stored with a path like ".../a1b2c3-580085" — no dot anywhere —
// which meant previewKind() below had nothing to go on and always fell
// back to "no inline preview," even for a perfectly normal photo or PDF,
// and the downloaded copy on the person's own phone had the same
// problem opening it correctly.
export function ensureFileExtension(filename: string, mimeType: string): string {
  if (/\.[a-zA-Z0-9]{1,8}$/.test(filename)) return filename;
  const inferred = MIME_TO_EXTENSION[mimeType.split(";")[0].trim().toLowerCase()];
  return inferred ? `${filename}.${inferred}` : filename;
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
// extension (see ensureFileExtension above — this covers files that were
// already uploaded before that existed, like the "580085" one). Reads
// the Content-Type Storage itself recorded for the file, via
// sniffContentType() below, rather than giving up.
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

// Forces an actual save-to-device download (never an inline preview).
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
export async function forceDownload(filePath: string, fallbackTitle: string): Promise<void> {
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
    }
