// Shared file-handling helpers for uploaded material documents.
// Centralised view/download/type detection so StudyPanel, course page,
// catalogue, and DocumentViewer all behave identically.

import { supabase } from "@/integrations/supabase/client";

export function originalFileName(filePath: string, fallbackTitle: string): string {
  const base = filePath.split("/").pop() ?? "";
  // Storage path: `${userId}/${uuid}-${originalName}` — uuid is 36 chars, then '-'
  const name = base.length > 37 ? base.slice(37) : base;
  return name || fallbackTitle;
}

function fileExtension(filePath: string): string {
  const name = (filePath.split("/").pop() ?? "").split("?")[0];
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

export type PreviewKind =
  | "pdf"
  | "image"
  | "text"
  | "docx"
  | "pptx"
  | "xlsx"
  | "video"
  | "audio"
  | "office" // legacy .doc/.ppt/.xls we can't fully render in-app
  | "none";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "heic", "heif", "avif"]);
const TEXT_EXTS = new Set(["txt", "md", "csv", "json", "log", "rtf"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "ogg", "mov", "m4v"]);
const AUDIO_EXTS = new Set(["mp3", "wav", "ogg", "m4a", "aac", "flac"]);

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
  "image/avif": "avif",
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
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/ogg": "ogg",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
};

function kindFromMagicBytes(bytes: Uint8Array): PreviewKind {
  const b = (n: number) => bytes[n] ?? -1;
  // %PDF
  if (b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46) return "pdf";
  // JPEG
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image";
  // PNG
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return "image";
  // GIF
  if (b(0) === 0x47 && b(1) === 0x49 && b(2) === 0x46) return "image";
  // BMP
  if (b(0) === 0x42 && b(1) === 0x4d) return "image";
  // WEBP (RIFF....WEBP)
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46) return "image";
  // MP4/MOV (ftyp at offset 4)
  if (b(4) === 0x66 && b(5) === 0x74 && b(6) === 0x79 && b(7) === 0x70) return "video";
  // ZIP-based office (docx/pptx/xlsx) — refine later by extension/mime
  if (b(0) === 0x50 && b(1) === 0x4b && (b(2) === 0x03 || b(2) === 0x05 || b(2) === 0x07)) {
    return "office";
  }
  return "none";
}

export async function sniffLocalFileKind(file: File | Blob): Promise<PreviewKind> {
  try {
    const buffer = await file.slice(0, 16).arrayBuffer();
    return kindFromMagicBytes(new Uint8Array(buffer));
  } catch {
    return "none";
  }
}

export async function sniffFileSignature(url: string): Promise<PreviewKind> {
  try {
    const response = await fetch(url, { headers: { Range: "bytes=0-15" } });
    const buffer = await response.arrayBuffer();
    return kindFromMagicBytes(new Uint8Array(buffer));
  } catch {
    return "none";
  }
}

const KIND_TO_EXTENSION: Record<Exclude<PreviewKind, "none" | "office">, string> = {
  pdf: "pdf",
  image: "jpg",
  text: "txt",
  docx: "docx",
  pptx: "pptx",
  xlsx: "xlsx",
  video: "mp4",
  audio: "mp3",
};

export async function ensureFileExtension(filename: string, file: File): Promise<string> {
  if (/\.[a-zA-Z0-9]{1,8}$/.test(filename)) return filename;
  const fromMime = MIME_TO_EXTENSION[file.type.split(";")[0].trim().toLowerCase()];
  if (fromMime) return `${filename}.${fromMime}`;
  const sniffed = await sniffLocalFileKind(file);
  if (sniffed !== "none" && sniffed !== "office") return `${filename}.${KIND_TO_EXTENSION[sniffed]}`;
  if (sniffed === "office") return `${filename}.docx`;
  return filename;
}

export function previewKind(filePath: string): PreviewKind {
  const ext = fileExtension(filePath);
  if (ext === "pdf") return "pdf";
  if (IMAGE_EXTS.has(ext)) return "image";
  if (TEXT_EXTS.has(ext)) return "text";
  if (ext === "docx") return "docx";
  if (ext === "pptx") return "pptx";
  if (ext === "xlsx") return "xlsx";
  if (ext === "doc" || ext === "ppt" || ext === "xls") return "office";
  if (VIDEO_EXTS.has(ext)) return "video";
  if (AUDIO_EXTS.has(ext)) return "audio";
  return "none";
}

export function previewKindFromMime(mime: string | null): PreviewKind {
  if (!mime) return "none";
  const type = mime.split(";")[0].trim().toLowerCase();
  if (type === "application/pdf") return "pdf";
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("text/")) return "text";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (type === "application/vnd.openxmlformats-officedocument.presentationml.presentation") return "pptx";
  if (type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "xlsx";
  if (
    type === "application/msword" ||
    type === "application/vnd.ms-powerpoint" ||
    type === "application/vnd.ms-excel" ||
    type === "application/rtf"
  ) {
    return "office";
  }
  return "none";
}

/** Prefer extension → mime → magic bytes. Also upgrades generic "office" zip kinds. */
export function refinePreviewKind(
  kind: PreviewKind,
  filePath: string | null,
  mime: string | null,
): PreviewKind {
  if (kind === "pdf" || kind === "image" || kind === "text" || kind === "video" || kind === "audio") {
    return kind;
  }
  if (kind === "docx" || kind === "pptx" || kind === "xlsx") return kind;

  const fromExt = filePath ? previewKind(filePath) : "none";
  if (fromExt !== "none" && fromExt !== "office") return fromExt;

  const fromMime = previewKindFromMime(mime);
  if (fromMime !== "none" && fromMime !== "office") return fromMime;

  if (kind === "office" || fromExt === "office" || fromMime === "office") {
    const ext = filePath ? fileExtension(filePath) : "";
    if (ext === "docx") return "docx";
    if (ext === "pptx") return "pptx";
    if (ext === "xlsx") return "xlsx";
    return "office";
  }

  if (kind === "none") {
    if (fromExt !== "none") return fromExt;
    return fromMime;
  }
  return kind;
}

export async function sniffContentType(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.headers.get("content-type");
  } catch {
    return null;
  }
}

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function getViewUrl(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("materials")
    .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS);
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

export async function fetchFileForOffline(
  filePath: string,
): Promise<{ blob: Blob; mime: string } | null> {
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

export function downloadBlob(blob: Blob, filename: string): void {
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
    setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
  }
}

export async function forceDownload(filePath: string, fallbackTitle: string): Promise<Blob> {
  const filename = originalFileName(filePath, fallbackTitle);
  const url = await getDownloadUrl(filePath, filename);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Couldn't fetch the file (status ${response.status}).`);
  const blob = await response.blob();
  downloadBlob(blob, filename);
  return blob;
    }
