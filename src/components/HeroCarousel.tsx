import { useEffect, useState } from "react";
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

const SLIDES = [
  cbuGateDay, campusQuad, cbuLawn, cbuSunset, campusBuildings, cbuCourtyard,
  cbuMainBuilding, campusGate, cbuPalm, campusGarden, cbuGateNight, graduation,
];

const INTERVAL_MS = 4200;

// One dedicated hero image slot. Each photo crossfades into the next
// — quiet, cinematic, never a jump. Keeps the same on-page position as
// the previous strip, just consolidated into a single frame.
export function HeroImageStrip() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setActive((i) => (i + 1) % SLIDES.length);
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="w-full bg-surface px-4 py-5 sm:py-6 lg:py-7">
      <figure className="relative mx-auto aspect-[16/9] w-full max-w-4xl overflow-hidden rounded-2xl ring-1 ring-white/10 shadow-elegant sm:aspect-[21/9]">
        {SLIDES.map((photo, i) => (
          <img
            key={i}
            src={photo.url}
            alt=""
            loading={i === 0 ? "eager" : "lazy"}
            aria-hidden={i !== active}
            className="absolute inset-0 h-full w-full object-cover transition-opacity duration-[1400ms] ease-in-out"
            style={{ opacity: i === active ? 1 : 0 }}
          />
        ))}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
        <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i === active ? "w-5 bg-gold" : "w-1.5 bg-white/40"
              }`}
            />
          ))}
        </div>
      </figure>
    </div>
  );
}
