import { useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import campusBuildings from "@/assets/campus-buildings.asset.json";
import campusGate from "@/assets/campus-gate.asset.json";
import campusGarden from "@/assets/campus-garden.asset.json";
import campusQuad from "@/assets/campus-quad.asset.json";
import graduation from "@/assets/graduation.asset.json";

const SLIDES = [
  { img: campusQuad, caption: "Riverside Campus, Kitwe" },
  { img: campusBuildings, caption: "Lecture halls & labs" },
  { img: campusGate, caption: "Main gate" },
  { img: campusGarden, caption: "Campus grounds" },
  { img: graduation, caption: "Graduation day" },
];

// Full-bleed autoplaying backdrop for the hero. Plain setInterval + Embla's
// own API — no autoplay plugin dependency needed.
export function HeroCarousel() {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (!emblaApi) return;
    const id = setInterval(() => emblaApi.scrollNext(), 4500);
    const onSelect = () => setSelected(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    return () => {
      clearInterval(id);
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden">
      <div ref={emblaRef} className="h-full w-full">
        <div className="flex h-full">
          {SLIDES.map((s, i) => (
            <div key={i} className="relative h-full min-w-0 flex-[0_0_100%]">
              <img src={s.img.url} alt="" className="h-full w-full object-cover" />
            </div>
          ))}
        </div>
      </div>
      {/* scrim so hero copy stays legible over any photo */}
      <div className="absolute inset-0 bg-hero opacity-90" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
      <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
        {SLIDES.map((_, i) => (
          <span key={i} className={`h-1.5 rounded-full transition-all ${i === selected ? "w-5 bg-gold" : "w-1.5 bg-white/30"}`} />
        ))}
      </div>
    </div>
  );
}
