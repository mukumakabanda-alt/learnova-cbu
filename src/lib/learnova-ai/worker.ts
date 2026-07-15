/// <reference lib="webworker" />

// Runs LearnovaAI.processDocument() off the main thread. See the comment
// on runAIOffMainThread() in DocumentUpload.tsx for why: a realistic
// ~60,000-character upload (a combined set of lecture notes, or one
// longer scanned chapter) measured at over 6 seconds of pure synchronous
// computation — on the main thread that freezes the whole upload screen
// for that whole time, which on a phone reads as "the app just died,"
// not "still working." This engine has zero DOM/window dependency (it's
// pure text-in, data-out — verified), so it runs identically inside a
// Worker.
import { LearnovaAI } from "./index";
import type { ProcessOptions } from "./types";

const ctx = self as unknown as Worker;

ctx.onmessage = (event: MessageEvent<{ text: string; options: ProcessOptions }>) => {
  try {
    const { text, options } = event.data;
    const result = LearnovaAI.processDocument(text, options);
    ctx.postMessage({ ok: true as const, result });
  } catch (err) {
    try {
      ctx.postMessage({ ok: false as const, error: err instanceof Error ? err.message : String(err) });
    } catch {
      // If even the error can't be posted, there's nothing more to do —
      // the caller's own timeout will fall back to the main thread.
    }
  }
};
