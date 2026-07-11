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
