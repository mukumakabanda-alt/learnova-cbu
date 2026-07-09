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

// Doubled so the track can scroll from 0 to -50% and loop with zero seam —
// the second half is a perfect repeat of the first, so the cut is invisible.
const TRACK = [...SLIDES, ...SLIDES];

// A dedicated, self-contained gallery band — not a slideshow, not a hero
// background. Pure motion, zero text, zero chrome. It exists purely to say
// "this is a real campus, here's the proof" in under two seconds, then gets
// out of the way for the headline below it.
export function HeroImageStrip() {
  return (
    <div
      aria-hidden
      className="group relative w-full overflow-hidden border-b border-white/5 bg-surface py-5 sm:py-6 lg:py-7"
    >
      <div className="hero-marquee-track flex w-max gap-4 px-4 group-hover:[animation-play-state:paused] sm:gap-5">
        {TRACK.map((slide, i) => (
          <figure
            key={i}
            className="relative h-32 w-48 shrink-0 overflow-hidden rounded-2xl ring-1 ring-white/10 transition-transform duration-500 ease-out hover:scale-[1.03] sm:h-40 sm:w-60 lg:h-48 lg:w-72"
          >
            <img
              src={slide.url}
              alt=""
              loading={i === 0 ? "eager" : "lazy"}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
          </figure>
        ))}
      </div>

      {/* Edge fades — the strip appears to bleed off both sides rather than
          hard-cut, which is what makes it read as a continuous reel. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-surface to-transparent sm:w-24 lg:w-32" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-surface to-transparent sm:w-24 lg:w-32" />
    </div>
  );
      }
