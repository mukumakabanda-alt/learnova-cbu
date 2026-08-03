// Learnova's own ZIP reader.
//
// JSZip is tried first (fast, battle-tested), but it aborts the whole
// archive with "Corrupted zip: unexpected signature" whenever a producer
// writes local headers JSZip doesn't like — PowerPoint files exported by
// some tools (data descriptors, ZIP64 fields, extra padding) hit this
// constantly, which is why decks refused to open. So when JSZip throws,
// we fall back to reading the archive ourselves straight from the
// central directory (the authoritative index at the end of every zip)
// and inflate each entry with the browser's own DecompressionStream.
// No network, no external service — works identically offline.

export type ZipEntry = {
  name: string;
  async(type: "text"): Promise<string>;
  async(type: "base64"): Promise<string>;
  async(type: "uint8array"): Promise<Uint8Array>;
};

export type ZipArchive = {
  files: Record<string, ZipEntry>;
  file(path: string): ZipEntry | null;
};

function u16(v: DataView, o: number) {
  return v.getUint16(o, true);
}
function u32(v: DataView, o: number) {
  return v.getUint32(o, true);
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const DS = (globalThis as any).DecompressionStream;
  if (!DS) throw new Error("This browser can't decompress the archive.");
  const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(new DS("deflate-raw"));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...(bytes.subarray(i, i + chunk) as unknown as number[]));
  }
  return btoa(binary);
}

/** Minimal, tolerant central-directory ZIP parser. */
async function parseZip(buffer: ArrayBuffer): Promise<ZipArchive> {
  if (!(globalThis as any).DecompressionStream) throw new Error("no-decompression-stream");
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // Find the End Of Central Directory record (scan back over the comment).
  let eocd = -1;
  const min = Math.max(0, bytes.length - 66000);
  for (let i = bytes.length - 22; i >= min; i--) {
    if (u32(view, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("This file isn't a readable archive.");

  let count = u16(view, eocd + 10);
  let cdOffset = u32(view, eocd + 16);

  // ZIP64: the real values live in the ZIP64 EOCD record.
  if (cdOffset === 0xffffffff || count === 0xffff) {
    for (let i = eocd - 20; i >= 0; i--) {
      if (u32(view, i) === 0x07064b50) {
        const z64 = Number(view.getBigUint64(i + 8, true));
        if (u32(view, z64) === 0x06064b50) {
          count = Number(view.getBigUint64(z64 + 32, true));
          cdOffset = Number(view.getBigUint64(z64 + 48, true));
        }
        break;
      }
    }
  }

  const decoder = new TextDecoder("utf-8");
  const files: Record<string, ZipEntry> = {};
  let p = cdOffset;

  for (let n = 0; n < count && p + 46 <= bytes.length; n++) {
    if (u32(view, p) !== 0x02014b50) break;
    const method = u16(view, p + 10);
    let compSize = u32(view, p + 20);
    let uncompSize = u32(view, p + 24);
    const nameLen = u16(view, p + 28);
    const extraLen = u16(view, p + 30);
    const commentLen = u16(view, p + 32);
    let localOffset = u32(view, p + 42);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));

    // ZIP64 extra field for oversized entries.
    if (compSize === 0xffffffff || uncompSize === 0xffffffff || localOffset === 0xffffffff) {
      let e = p + 46 + nameLen;
      const end = e + extraLen;
      while (e + 4 <= end) {
        const id = u16(view, e);
        const size = u16(view, e + 2);
        if (id === 0x0001) {
          let q = e + 4;
          if (uncompSize === 0xffffffff) { uncompSize = Number(view.getBigUint64(q, true)); q += 8; }
          if (compSize === 0xffffffff) { compSize = Number(view.getBigUint64(q, true)); q += 8; }
          if (localOffset === 0xffffffff) { localOffset = Number(view.getBigUint64(q, true)); }
          break;
        }
        e += 4 + size;
      }
    }

    p += 46 + nameLen + extraLen + commentLen;
    if (!name || name.endsWith("/")) continue;

    const read = async (): Promise<Uint8Array> => {
      // Local header sizes are unreliable; only its name/extra lengths matter.
      if (u32(view, localOffset) !== 0x04034b50) throw new Error(`Entry ${name} is unreadable.`);
      const lNameLen = u16(view, localOffset + 26);
      const lExtraLen = u16(view, localOffset + 28);
      const start = localOffset + 30 + lNameLen + lExtraLen;
      const raw = bytes.subarray(start, start + compSize);
      if (method === 0) return raw;
      if (method === 8) return inflateRaw(raw);
      throw new Error(`Entry ${name} uses an unsupported compression method.`);
    };

    const cache = new Map<string, unknown>();
    const entry = {
      name,
      async async(type: string) {
        if (cache.has(type)) return cache.get(type) as never;
        const data = await read();
        const out =
          type === "text" ? new TextDecoder("utf-8").decode(data) : type === "base64" ? toBase64(data) : data;
        cache.set(type, out);
        return out as never;
      },
    } as ZipEntry;
    files[name] = entry;
  }

  if (!Object.keys(files).length) throw new Error("This archive is empty or unreadable.");
  return { files, file: (path: string) => files[path] ?? null };
}

/** Opens a zip-based file (pptx/docx/xlsx/zip) as tolerantly as possible. */
export async function openZip(blob: Blob): Promise<ZipArchive> {
  const buffer = await blob.arrayBuffer();
  try {
    return await parseZip(buffer);
  } catch (err) {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buffer, { checkCRC32: false } as any);
    if (!Object.keys(zip.files).length) throw err;
    return zip as unknown as ZipArchive;
  }
}
