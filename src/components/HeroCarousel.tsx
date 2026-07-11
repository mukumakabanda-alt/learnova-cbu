import { useEffect, useRef, useState } from "react";
import campusBuildings from "@/assets/campus-buildings.asset.json";
import campusGate from "@/assets/campus-gate.asset.json";
import campusGarden from "@/assets/campus-garden.asset.json";
import campusQuad from "@/assets/campus-quad.asset.json";
import graduation from "@/assets/graduation.asset.json";
import cbuGateDay from "@/assets/cbu-gate-day.jpg.asset.json";
import cbuLawn from "@/assets/cbu-lawn.jpg.asset.json";
import cbuSunset from "@/assets/cbu-sunset.jpg.asset.json";
import cbuGateNight from "@/assets/cbu-gate-night.jpg.asset.json";
import cbuCourtyard from "@/assets/cbu-courtyard.jpg.asset.json";
import cbuMainBuilding from "@/assets/cbu-main-building.jpg.asset.json";
import cbuPalm from "@/assets/cbu-palm.jpg.asset.json";
import { useHeroSlides } from "@/lib/queries";

const DEFAULT_SLIDES = [
  cbuGateDay, campusQuad, cbuLawn, cbuSunset, campusBuildings, cbuCourtyard,
  cbuMainBuilding, campusGate, cbuPalm, campusGarden, cbuGateNight, graduation,
].map((s) => s.url);

const INTERVAL_MS = 4200;

// One dedicated hero image slot. Each photo crossfades into the next —
// quiet, cinematic, never a jump.
//
// Perf: only TWO <img> DOM nodes ever exist (two persistent "layers" whose
// `src` gets swapped), never all 12 at once — the old version mounted every
// slide simultaneously above the fold, which meant ~3MB of images loaded
// before anyone had scrolled a pixel. Each upcoming photo is only fetched
// (via a throwaway Image() object, no DOM node) a moment before it's shown,
// and the whole rotation — so all future network requests — pauses
// entirely while the strip is scrolled off-screen.
//
// Source of the photos: admin-managed via the "Carousel" tab in /admin
// (hero_slides table + 'hero-images' storage bucket). If the admin hasn't
// added any yet, this falls back to the original bundled campus photos so
// the homepage never looks broken on a fresh install.
export function HeroImageStrip() {
  const { data: adminSlides } = useHeroSlides();
  const slides = adminSlides && adminSlides.length > 0 ? adminSlides.map((s) => s.url) : DEFAULT_SLIDES;

  const [layerSrcs, setLayerSrcs] = useState<[string, string]>([
    slides[0],
    slides[1 % slides.length],
  ]);
  const [activeLayer, setActiveLayer] = useState<0 | 1>(0);
  const [slideIndex, setSlideIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // If the slide set changes (admin photos finish loading in, or someone
  // adds/removes one), restart from the first slide of the new set rather
  // than showing a stale index from the old array.
  useEffect(() => {
    setLayerSrcs([slides[0], slides[1 % slides.length]]);
    setActiveLayer(0);
    setSlideIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides.join("|")]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.1 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || slides.length < 2) return;
    let cancelled = false;

    const id = setInterval(() => {
      const nextIndex = (slideIndex + 1) % slides.length;
      const nextUrl = slides[nextIndex];
      const preload = new Image();
      preload.onload = () => {
        if (cancelled) return;
        setLayerSrcs((prev) => {
          const updated: [string, string] = [...prev];
          updated[activeLayer === 0 ? 1 : 0] = nextUrl;
          return updated;
        });
        setActiveLayer((l) => (l === 0 ? 1 : 0));
        setSlideIndex(nextIndex);
      };
      preload.src = nextUrl;
    }, INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isVisible, slideIndex, activeLayer, slides]);

  return (
    <div ref={containerRef} className="w-full bg-surface px-4 py-5 sm:py-6 lg:py-7">
      <figure className="relative mx-auto aspect-[16/9] w-full max-w-4xl overflow-hidden rounded-2xl ring-1 ring-white/10 shadow-elegant sm:aspect-[21/9]">
        {layerSrcs.map((src, layer) => (
          <img
            key={layer}
            src={src}
            alt=""
            loading={layer === 0 ? "eager" : "lazy"}
            className="absolute inset-0 h-full w-full object-cover transition-opacity duration-[1400ms] ease-in-out"
            style={{ opacity: layer === activeLayer ? 1 : 0 }}
          />
        ))}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
        <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
          {slides.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i === slideIndex ? "w-5 bg-gold" : "w-1.5 bg-white/40"
              }`}
            />
          ))}
        </div>
      </figure>
    </div>
  );
      }
