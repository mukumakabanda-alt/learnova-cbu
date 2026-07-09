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

// Six frames, two photos each — all twelve campus shots used exactly once,
// no duplicates. Frame i shows SLIDES[i] then crossfades to SLIDES[i + 6].
// Each frame runs its own cycle length, so they drift out of phase with
// each other permanently — nothing fades in sync, which is what makes a
// static grid of photos feel alive instead of mechanical.
const FRAME_COUNT = 6;
const DURATIONS = [12, 15, 18, 13, 16, 14]; // seconds, one per frame — slow, calm, staggered

export function HeroImageStrip() {
  return (
    <div
      aria-hidden
      className="w-full border-b border-white/5 bg-surface px-4 py-5 sm:py-6 lg:py-7"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6 lg:gap-5">
        {Array.from({ length: FRAME_COUNT }).map((_, i) => {
          const duration = DURATIONS[i];
          const photos = [SLIDES[i], SLIDES[i + FRAME_COUNT]];
          return (
            <figure
              key={i}
              className="group/photo relative aspect-[4/3] overflow-hidden rounded-2xl ring-1 ring-white/10"
            >
              {photos.map((photo, p) => (
                <img
                  key={p}
                  src={photo.url}
                  alt=""
                  loading={i === 0 && p === 0 ? "eager" : "lazy"}
                  className="hero-tile-img absolute inset-0 h-full w-full object-cover group-hover/photo:[animation-play-state:paused]"
                  style={{
                    animationDuration: `${duration}s`,
                    animationDelay: `${-(p * duration) / photos.length}s`,
                  }}
                />
              ))}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-transparent" />
            </figure>
          );
        })}
      </div>
    </div>
  );
  }
