import { useEffect, useLayoutEffect, useState } from "react";

// useLayoutEffect is a no-op during SSR (and warns about it) — fall back to
// useEffect on the server so the warning never fires, while still getting
// the synchronous, pre-paint behavior on the client where it matters.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Netflix-style brand moment: once per browser session, a brief copper
// seam cracks across the dark screen and the wordmark resolves out of it
// before the real app appears. Session-scoped (not per-navigation) so it
// never gets in the way after the first load.
//
// Both the server render and the very first client render always return
// `null` — that keeps SSR markup and pre-hydration client markup identical
// (no hydration mismatch warning). The layout effect below then runs
// SYNCHRONOUSLY, before the browser paints anything for that commit, so
// the choice between "show splash" and "show nothing" is made before the
// real page ever has a chance to flash on screen first.
export function BrandIntro() {
  const [phase, setPhase] = useState<"hidden" | "playing" | "done">("hidden");

  useIsomorphicLayoutEffect(() => {
    const seen = sessionStorage.getItem("learnova-intro-seen");
    setPhase(seen ? "done" : "playing");
  }, []);

  useEffect(() => {
    if (phase !== "playing") return;
    const t = setTimeout(() => {
      setPhase("done");
      sessionStorage.setItem("learnova-intro-seen", "1");
    }, 1900);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase !== "playing") return null;

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[100] grid place-items-center bg-background"
      style={{ animation: "learnova-intro-fade 1.9s ease forwards" }}
    >
      <div className="relative h-px w-64 overflow-hidden sm:w-96">
        <div className="absolute inset-0 bg-seam-line opacity-0" style={{ animation: "learnova-seam-in 0.9s ease forwards 0.1s" }} />
      </div>
      <div
        className="absolute font-display text-4xl tracking-tight text-foreground opacity-0 sm:text-5xl"
        style={{ animation: "learnova-word-in 0.7s ease forwards 0.55s" }}
      >
        Learn<span className="text-gradient-gold">ova</span>
      </div>
      <style>{`
        @keyframes learnova-seam-in { from { opacity: 0; transform: scaleX(0); } to { opacity: 1; transform: scaleX(1); } }
        @keyframes learnova-word-in { from { opacity: 0; transform: translateY(8px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes learnova-intro-fade { 0% { opacity: 1; } 78% { opacity: 1; } 100% { opacity: 0; visibility: hidden; } }
        @media (prefers-reduced-motion: reduce) {
          .fixed[aria-hidden] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
