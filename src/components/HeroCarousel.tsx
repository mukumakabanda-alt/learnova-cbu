import { useEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
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

export function HeroCarousel() {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, duration: 34 });
  const [selected, setSelected] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);

  // Pause the autoplay + Ken Burns loop when scrolled out of view — no point
  // burning battery animating a hero the person can't see.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelected(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    return () => emblaApi.off("select", onSelect);
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi || !visible) return;
    const id = setInterval(() => emblaApi.scrollNext(), 5200);
    return () => clearInterval(id);
  }, [emblaApi, visible]);

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden">
      <div ref={emblaRef} className="h-full w-full">
        <div className="flex h-full">
          {SLIDES.map((s, i) => (
            <div key={i} className="relative h-full min-w-0 flex-[0_0_100%] overflow-hidden">
              {/* Ken Burns: the active slide slowly zooms in — this is the "3D feel"
                  cue on the hero itself; every other slide sits still at rest. */}
              <img
                src={s.url}
                alt=""
                loading={i === 0 ? "eager" : "lazy"}
                className={`h-full w-full object-cover transition-transform ease-out ${
                  i === selected ? "scale-110 duration-[6500ms]" : "scale-100 duration-0"
                }`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Readability scrim — deliberately light. Enough contrast for white
          text, not enough to erase the campus behind it. */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-background/5" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-transparent to-transparent" />

      <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            aria-label={`Go to slide ${i + 1}`}
            onClick={() => emblaApi?.scrollTo(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === selected ? "w-6 bg-gold" : "w-1.5 bg-white/35 hover:bg-white/60"
            }`}
          />
        ))}
      </div>
    </div>
  );
      }
