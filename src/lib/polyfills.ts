// Polyfills for newer TypedArray methods (Uint8Array.prototype.toHex,
// fromHex, toBase64, fromBase64, and their setFrom* counterparts) that
// this version of pdf.js relies on internally — PDF files can contain
// literal hex-encoded strings as part of the format itself, and pdf.js
// reaches for these methods to decode them. These are recent additions
// to JavaScript (the "Uint8Array to/from base64/hex" proposal) that
// aren't supported everywhere yet — some Android WebViews and embedded
// browser contexts (like Lovable's own editor preview) lag behind full
// desktop Chrome specifically on this. "a.toHex is not a function" was
// exactly this: not a bug in this codebase, a missing browser API pdf.js
// assumed would exist.
//
// Each method is only added if genuinely missing, so importing this file
// is a safe no-op on any environment that already supports them
// natively. Import this for its side effect only, before anything that
// might use pdf.js:
//   import "@/lib/polyfills";

const proto = Uint8Array.prototype as any;
const ctor = Uint8Array as any;
const HEX_CHARS = "0123456789abcdef";

if (typeof proto.toHex !== "function") {
  proto.toHex = function (this: Uint8Array): string {
    let out = "";
    for (let i = 0; i < this.length; i++) out += HEX_CHARS[this[i] >> 4] + HEX_CHARS[this[i] & 0x0f];
    return out;
  };
}

if (typeof proto.setFromHex !== "function") {
  proto.setFromHex = function (this: Uint8Array, hex: string): { read: number; written: number } {
    const len = Math.min(this.length, Math.floor(hex.length / 2));
    for (let i = 0; i < len; i++) this[i] = parseInt(hex.substr(i * 2, 2), 16);
    return { read: len * 2, written: len };
  };
}

if (typeof ctor.fromHex !== "function") {
  ctor.fromHex = function (hex: string): Uint8Array {
    const bytes = new Uint8Array(Math.floor(hex.length / 2));
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    return bytes;
  };
}

if (typeof proto.toBase64 !== "function") {
  proto.toBase64 = function (this: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < this.length; i++) binary += String.fromCharCode(this[i]);
    return btoa(binary);
  };
}

if (typeof ctor.fromBase64 !== "function") {
  ctor.fromBase64 = function (base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  };
}

if (typeof proto.setFromBase64 !== "function") {
  proto.setFromBase64 = function (this: Uint8Array, base64: string): { read: number; written: number } {
    const binary = atob(base64);
    const len = Math.min(this.length, binary.length);
    for (let i = 0; i < len; i++) this[i] = binary.charCodeAt(i);
    return { read: base64.length, written: len };
  };
      }
