import { useEffect, useLayoutEffect, useState } from "react";

// useLayoutEffect is a no-op during SSR (and warns about it) — fall back to
// useEffect on the server so the warning never fires, while still getting
// the synchronous, pre-paint behavior on the client where it matters.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Brand intro, rebuilt around one idea: the wordmark builds itself letter
// by letter, starting from "L" — not a mask wiping across an already-
// finished word (that was the previous version, and it read as one
// continuous sweep rather than each letter actually arriving on its own,
// which is the specific thing this was rebuilt to fix). Now:
//   1. "L" arrives alone — a slightly bigger entrance with a brief
//      glow-pop, since it's the seed the rest of the word grows out of.
//   2. After a short beat, the remaining seven letters cascade in, left
//      to right, in quick staggered succession.
//   3. Once the full word has landed, a single soft light sweep passes
//      across it, once.
//   4. Brief hold, then the whole scene fades out.
// Gone entirely: the floating 3D book cuboids, the dual breathing glow
// blobs, the separate seam-crack flourish. One glow, one reveal, one
// shine — "logo, one clean motion, out," not several ornaments
// competing for attention at once.
//
// Persistence: once per calendar day, not a rolling hours-since-last-seen
// window. A study app gets opened many times across one day (between
// lectures, revising at night) — replaying every few hours wears thin on
// a single busy day, so this now keys off the browser's local date: a
// new day gets the moment again, the same day doesn't.
const STORAGE_KEY = "learnova-intro-last-seen";

const INTRO_DURATION_MS = 2650;
const INTRO_DURATION_REDUCED_MS = 700;

function shouldPlayIntro(): boolean {
  try {
    const last = localStorage.getItem(STORAGE_KEY);
    if (!last) return true;
    return last !== new Date().toDateString();
  } catch {
    // Storage blocked (private mode, etc.) — can't remember, so just show it.
    return true;
  }
}

function markIntroSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, new Date().toDateString());
  } catch {
    // Nothing we can do — worst case it plays again next time.
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// Per-letter timing. "L" gets its own beat (L_DURATION), then a short
// pause (PAUSE_AFTER_L), then the remaining seven letters stagger in one
// after another (STAGGER apart, each taking LETTER_DURATION to land).
const L_DURATION = 0.5;
const PAUSE_AFTER_L = 0.12;
const LETTER_DURATION = 0.4;
const STAGGER = 0.085;

function letterDelay(index: number): number {
  if (index === 0) return 0;
  return L_DURATION + PAUSE_AFTER_L + (index - 1) * STAGGER;
}

const LEARN = ["L", "e", "a", "r", "n"];
const OVA = ["o", "v", "a"];

export function BrandIntro() {
  const [phase, setPhase] = useState<"hidden" | "playing" | "done">("hidden");
  const [durationMs, setDurationMs] = useState(INTRO_DURATION_MS);

  useIsomorphicLayoutEffect(() => {
    const reduced = prefersReducedMotion();
    setDurationMs(reduced ? INTRO_DURATION_REDUCED_MS : INTRO_DURATION_MS);
    setPhase(shouldPlayIntro() ? "playing" : "done");
  }, []);

  useEffect(() => {
    if (phase !== "playing") return;
    const t = setTimeout(() => {
      setPhase("done");
      markIntroSeen();
    }, durationMs);
    return () => clearTimeout(t);
  }, [phase, durationMs]);

  if (phase !== "playing") return null;

  return (
    <div
      aria-hidden
      role="presentation"
      className="fixed inset-0 z-[100] overflow-hidden bg-background learnova-intro-overlay"
      style={{ animationDuration: `${durationMs}ms` }}
    >
      {/* one soft glow — fades in once and holds still, no breathing loop */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[55vh] w-[55vh] -translate-x-1/2 -translate-y-1/2 rounded-full learnova-glow" />

      <div className="relative grid h-full w-full place-items-center">
        <div className="relative inline-block">
          <span className="relative inline-flex whitespace-nowrap font-display text-4xl tracking-tight text-foreground sm:text-5xl">
            {LEARN.map((ch, i) => (
              <span
                key={`learn-${i}`}
                className={i === 0 ? "learnova-mark" : "learnova-letter"}
                style={{ animationDelay: `${letterDelay(i)}s` }}
              >
                {ch}
              </span>
            ))}
            <span className="inline-flex text-gradient-gold">
              {OVA.map((ch, i) => (
                <span key={`ova-${i}`} className="learnova-letter" style={{ animationDelay: `${letterDelay(5 + i)}s` }}>
                  {ch}
                </span>
              ))}
            </span>
          </span>

          {/* single shine pass across the completed word, once, right after the cascade lands */}
          <span
            aria-hidden
            className="absolute inset-0 whitespace-nowrap bg-clip-text font-display text-4xl tracking-tight text-transparent sm:text-5xl learnova-shine"
            style={{ backgroundImage: "linear-gradient(115deg, transparent 42%, oklch(0.98 0.01 90 / 85%) 50%, transparent 58%)" }}
          >
            Learnova
          </span>
        </div>
      </div>

      <style>{`
        @keyframes learnova-intro-fade {
          0%   { opacity: 1; transform: scale(1); filter: blur(0px); }
          85%  { opacity: 1; transform: scale(1); filter: blur(0px); }
          100% { opacity: 0; transform: scale(1.03); filter: blur(6px); visibility: hidden; }
        }
        .learnova-intro-overlay {
          animation-name: learnova-intro-fade;
          animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
          animation-fill-mode: forwards;
        }

        @keyframes learnova-glow-in {
          from { opacity: 0; }
          to   { opacity: 0.4; }
        }
        .learnova-glow {
          background: radial-gradient(circle, oklch(0.7 0.15 48 / 22%), transparent 70%);
          filter: blur(20px);
          opacity: 0;
          animation: learnova-glow-in 0.9s ease forwards;
        }

        .learnova-letter, .learnova-mark {
          display: inline-block;
          opacity: 0;
        }

        @keyframes learnova-letter-in {
          from { opacity: 0; transform: translateY(16px) scale(0.88); filter: blur(5px); }
          to   { opacity: 1; transform: translateY(0) scale(1); filter: blur(0px); }
        }
        .learnova-letter {
          animation: learnova-letter-in ${LETTER_DURATION}s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes learnova-mark-in {
          0%   { opacity: 0; transform: translateY(20px) scale(0.7); filter: blur(7px) drop-shadow(0 0 0px oklch(0.78 0.14 65 / 0%)); }
          55%  { opacity: 1; transform: translateY(-3px) scale(1.1); filter: blur(0px) drop-shadow(0 0 16px oklch(0.78 0.14 65 / 60%)); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0px) drop-shadow(0 0 0px oklch(0.78 0.14 65 / 0%)); }
        }
        .learnova-mark {
          animation: learnova-mark-in ${L_DURATION}s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes learnova-shine-pass {
          0%   { opacity: 0; background-position: -120% 0; }
          15%  { opacity: 1; }
          55%  { opacity: 1; }
          70%  { opacity: 0; background-position: 220% 0; }
          100% { opacity: 0; background-position: 220% 0; }
        }
        .learnova-shine {
          background-size: 200% 100%;
          animation: learnova-shine-pass 0.4s ease-out forwards;
          animation-delay: 1.55s;
        }

        @keyframes learnova-intro-fade-reduced {
          0%   { opacity: 1; }
          85%  { opacity: 1; }
          100% { opacity: 0; visibility: hidden; }
        }
        @media (prefers-reduced-motion: reduce) {
          .learnova-letter,
          .learnova-mark,
          .learnova-glow,
          .learnova-shine {
            animation: none !important;
            filter: none !important;
            transform: none !important;
            opacity: 1 !important;
          }
          .learnova-glow, .learnova-shine {
            display: none !important;
          }
          .learnova-intro-overlay {
            animation-name: learnova-intro-fade-reduced !important;
          }
        }
      `}</style>
    </div>
  );
                }
