import { useEffect, useLayoutEffect, useState } from "react";

// useLayoutEffect is a no-op during SSR (and warns about it) — fall back to
// useEffect on the server so the warning never fires, while still getting
// the synchronous, pre-paint behavior on the client where it matters.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

type CSSVars = React.CSSProperties & Record<string, string | number>;

// Netflix-style brand moment, rebuilt:
//   1. A copper–gold crack scales in across the dark screen and fades — alone,
//      nothing else on screen yet, so nothing ever crosses through the word.
//   2. The wordmark wipes in left-to-right (clip-path), with a glowing edge
//      riding the reveal front. The instant the last letter is exposed, the
//      edge vanishes completely.
//   3. A single glint passes over the finished word, it settles with a soft
//      scale pulse, then the whole scene pulls back (scale + blur) and fades.
// Four CSS-only 3D book cuboids drift in the background the entire time —
// real rotateY/translateZ geometry, kept faint and small so it reads as
// ambient depth rather than a competing animation.
//
// Persistence: localStorage (not sessionStorage) with a timestamp. A brand
// new visitor sees it. Someone who reloads or comes back a few minutes later
// doesn't. Someone who returns after being away for a while sees it again —
// that's the "arriving fresh" feeling this is meant to create. Tune the
// threshold below in one place.
const STORAGE_KEY = "learnova-intro-last-seen";
const REPLAY_AFTER_MS = 1000 * 60 * 60 * 4; // 4 hours

const INTRO_DURATION_MS = 3100;
const INTRO_DURATION_REDUCED_MS = 700;

function shouldPlayIntro(): boolean {
  try {
    const last = localStorage.getItem(STORAGE_KEY);
    if (!last) return true;
    const elapsed = Date.now() - Number(last);
    return Number.isNaN(elapsed) || elapsed > REPLAY_AFTER_MS;
  } catch {
    // Storage blocked (private mode, etc.) — can't remember, so just show it.
    return true;
  }
}

function markIntroSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
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

interface FloatingBookProps {
  className: string;
  w: number;
  h: number;
  d: number;
  cover: string;
  spine: string;
  pages: string;
  duration: number;
  delay: number;
  dx: number;
  dy: number;
  dz: number;
  ry0: number;
  ry1: number;
}

function FloatingBook({ className, w, h, d, cover, spine, pages, duration, delay, dx, dy, dz, ry0, ry1 }: FloatingBookProps) {
  const sceneStyle: CSSVars = {
    position: "absolute",
    width: w,
    height: h,
    perspective: 700,
  };
  const cuboidStyle: CSSVars = {
    position: "relative",
    width: "100%",
    height: "100%",
    transformStyle: "preserve-3d",
    animationName: "learnova-book-in, learnova-book-float",
    animationDuration: `0.9s, ${duration}s`,
    animationTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1), ease-in-out",
    animationIterationCount: `1, infinite`,
    animationFillMode: "forwards, none",
    animationDelay: `${delay}s, ${delay + 0.9}s`,
    "--fdx": `${dx}px`,
    "--fdy": `${dy}px`,
    "--fdz": `${dz}px`,
    "--fry0": `${ry0}deg`,
    "--fry1": `${ry1}deg`,
  };

  return (
    <div className={className} style={sceneStyle}>
      <div style={cuboidStyle}>
        <div
          className="absolute inset-0 rounded-[2px]"
          style={{ background: `linear-gradient(135deg, ${cover}, ${spine})`, transform: `translateZ(${d / 2}px)`, boxShadow: "inset 0 0 10px rgba(0,0,0,0.35)" }}
        />
        <div
          className="absolute top-0"
          style={{ width: d, height: h, left: (w - d) / 2, background: spine, transform: `rotateY(90deg) translateZ(${w / 2}px)`, filter: "brightness(0.72)" }}
        />
        <div
          className="absolute top-0"
          style={{ width: d, height: h, left: (w - d) / 2, background: spine, transform: `rotateY(-90deg) translateZ(${w / 2}px)`, filter: "brightness(0.6)" }}
        />
        <div
          className="absolute left-0"
          style={{ width: w, height: d, top: (h - d) / 2, background: pages, transform: `rotateX(90deg) translateZ(${h / 2}px)` }}
        />
      </div>
    </div>
  );
}

const BOOKS: FloatingBookProps[] = [
  {
    className: "top-[10%] left-[7%]",
    w: 40, h: 56, d: 12,
    cover: "oklch(0.66 0.16 44 / 45%)", spine: "oklch(0.4 0.1 44 / 55%)", pages: "oklch(0.85 0.05 85 / 30%)",
    duration: 10, delay: 0.15, dx: 10, dy: -16, dz: 18, ry0: -22, ry1: 14,
  },
  {
    className: "bottom-[14%] right-[8%]",
    w: 46, h: 62, d: 14,
    cover: "oklch(0.82 0.135 85 / 40%)", spine: "oklch(0.55 0.1 80 / 50%)", pages: "oklch(0.9 0.04 88 / 28%)",
    duration: 12, delay: 0.35, dx: -12, dy: 14, dz: -16, ry0: 18, ry1: -20,
  },
  {
    className: "hidden sm:block top-[16%] right-[12%]",
    w: 30, h: 42, d: 10,
    cover: "oklch(0.7 0.1 200 / 32%)", spine: "oklch(0.45 0.08 200 / 40%)", pages: "oklch(0.88 0.03 200 / 22%)",
    duration: 9, delay: 0.5, dx: 8, dy: -10, dz: 10, ry0: 30, ry1: -8,
  },
  {
    className: "hidden sm:block bottom-[18%] left-[11%]",
    w: 26, h: 36, d: 9,
    cover: "oklch(0.66 0.16 44 / 30%)", spine: "oklch(0.4 0.1 44 / 40%)", pages: "oklch(0.85 0.05 85 / 20%)",
    duration: 13, delay: 0.6, dx: -8, dy: 12, dz: 14, ry0: -14, ry1: 24,
  },
];

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
      {/* ambient depth glow */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[60vh] w-[60vh] -translate-x-1/2 -translate-y-1/2 rounded-full learnova-glow-a" />
      <div className="pointer-events-none absolute left-[30%] top-[60%] h-[40vh] w-[40vh] -translate-x-1/2 -translate-y-1/2 rounded-full learnova-glow-b" />

      {/* floating 3D books */}
      <div className="pointer-events-none absolute inset-0">
        {BOOKS.map((b, i) => (
          <FloatingBook key={i} {...b} />
        ))}
      </div>

      {/* centerpiece */}
      <div className="relative grid h-full w-full place-items-center">
        {/* phase 1: seam crack, alone, fades completely before the word appears */}
        <div className="absolute h-px w-64 overflow-hidden sm:w-96">
          <div className="absolute inset-0 bg-seam-line learnova-seam-crack" />
        </div>

        {/* phase 2: word wipes in, edge sweeps with it, then vanishes */}
        <div className="relative inline-block">
          <span className="relative inline-block whitespace-nowrap font-display text-4xl text-foreground sm:text-5xl learnova-word-reveal">
            Learn<span className="text-gradient-gold">ova</span>
          </span>
          <span className="absolute left-0 top-[-8%] bottom-[-8%] w-[3px] rounded-full learnova-edge-sweep" />
          <span
            aria-hidden
            className="absolute inset-0 whitespace-nowrap bg-clip-text font-display text-4xl text-transparent sm:text-5xl learnova-shine"
            style={{ backgroundImage: "linear-gradient(115deg, transparent 42%, oklch(0.98 0.01 90 / 85%) 50%, transparent 58%)" }}
          >
            Learnova
          </span>
        </div>
      </div>

      <style>{`
        @keyframes learnova-intro-fade {
          0%   { opacity: 1; transform: scale(1); filter: blur(0px); }
          89%  { opacity: 1; transform: scale(1); filter: blur(0px); }
          100% { opacity: 0; transform: scale(1.035); filter: blur(6px); visibility: hidden; }
        }
        .learnova-intro-overlay {
          animation-name: learnova-intro-fade;
          animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
          animation-fill-mode: forwards;
        }

        @keyframes learnova-glow-in-breathe {
          0%   { opacity: 0; }
          28%  { opacity: var(--glow-peak, 0.5); }
          100% { opacity: var(--glow-peak, 0.5); }
        }
        @keyframes learnova-glow-breathe {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50%      { transform: translate(-50%, -50%) scale(1.12); }
        }
        .learnova-glow-a {
          --glow-peak: 0.5;
          background: radial-gradient(circle, oklch(0.7 0.15 48 / 22%), transparent 70%);
          filter: blur(10px);
          animation: learnova-glow-in-breathe 0.9s ease forwards, learnova-glow-breathe 7s ease-in-out infinite 0.9s;
        }
        .learnova-glow-b {
          --glow-peak: 0.35;
          background: radial-gradient(circle, oklch(0.82 0.135 85 / 16%), transparent 70%);
          filter: blur(14px);
          animation: learnova-glow-in-breathe 1.1s ease forwards 0.1s, learnova-glow-breathe 9s ease-in-out infinite 1s;
        }

        @keyframes learnova-book-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes learnova-book-float {
          0%, 100% { transform: translate3d(0, 0, 0) rotateX(8deg) rotateY(var(--fry0, -20deg)) rotateZ(3deg); }
          50%      { transform: translate3d(var(--fdx, 10px), var(--fdy, -14px), var(--fdz, 16px)) rotateX(14deg) rotateY(var(--fry1, 18deg)) rotateZ(-4deg); }
        }

        @keyframes learnova-seam-crack {
          0%   { opacity: 0; transform: scaleX(0); }
          38%  { opacity: 1; transform: scaleX(1); }
          72%  { opacity: 1; transform: scaleX(1); }
          100% { opacity: 0; transform: scaleX(1); }
        }
        .learnova-seam-crack {
          animation: learnova-seam-crack 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards 0.15s;
        }

        @keyframes learnova-reveal-clip {
          from { clip-path: inset(0 100% 0 -2%); }
          to   { clip-path: inset(0 0% 0 -2%); }
        }
        .learnova-word-reveal {
          animation: learnova-reveal-clip 1.1s cubic-bezier(0.16, 1, 0.3, 1) forwards 0.98s;
        }

        @keyframes learnova-edge-sweep {
          0%   { left: -1%; opacity: 0; }
          6%   { opacity: 1; }
          94%  { opacity: 1; }
          100% { left: 100%; opacity: 0; }
        }
        .learnova-edge-sweep {
          opacity: 0;
          background: linear-gradient(180deg, transparent, oklch(0.78 0.14 65), oklch(0.85 0.13 85), oklch(0.78 0.14 65), transparent);
          box-shadow: 0 0 14px 2px oklch(0.75 0.15 60 / 65%), 0 0 26px 6px oklch(0.82 0.13 85 / 35%);
          animation: learnova-edge-sweep 1.1s cubic-bezier(0.16, 1, 0.3, 1) forwards 0.98s;
        }

        @keyframes learnova-shine-pass {
          0%, 78%  { opacity: 0; background-position: -120% 0; }
          86%      { opacity: 1; }
          96%      { opacity: 0; background-position: 220% 0; }
          100%     { opacity: 0; background-position: 220% 0; }
        }
        .learnova-shine {
          background-size: 200% 100%;
          animation: learnova-shine-pass 0.9s ease-out forwards 2.14s;
        }

        @keyframes learnova-settle-pulse {
          0%   { transform: scale(1); }
          45%  { transform: scale(1.02); }
          100% { transform: scale(1); }
        }
        .learnova-word-reveal { transform-origin: left center; }

        @media (prefers-reduced-motion: reduce) {
          .learnova-intro-overlay,
          .learnova-glow-a,
          .learnova-glow-b,
          .learnova-seam-crack,
          .learnova-word-reveal,
          .learnova-edge-sweep,
          .learnova-shine,
          [style*="learnova-book"] {
            animation: none !important;
            clip-path: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
          .learnova-edge-sweep, .learnova-shine, .learnova-glow-a, .learnova-glow-b {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
