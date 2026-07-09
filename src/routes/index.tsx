import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { SiteHeader, SiteFooter, MobileTabBar } from "@/components/SiteHeader";
import { SearchBar } from "@/components/SearchBar";
import { CourseCard } from "@/components/CourseCard";
import { HeroImageStrip } from "@/components/HeroCarousel";
import { useProgrammes, useCourses } from "@/lib/queries";
import {
  ArrowRight, BookOpen, Compass, GraduationCap, Sparkles, Timer, Zap, Layers, FileText, ListChecks, MessageCircle, Flame,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Learnova — Study smarter at CBU" },
      { name: "description", content: "Find course notes, past papers, summaries and revision tools built for Copperbelt University students. Independent. Fast. Free to browse." },
      { property: "og:title", content: "Learnova — Study smarter at CBU" },
      { property: "og:url", content: "/" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: Home,
});

const demoActions = [
  { icon: FileText, label: "Summary" },
  { icon: Layers, label: "Flashcards" },
  { icon: ListChecks, label: "Practice quiz" },
  { icon: MessageCircle, label: "Ask a question" },
];

// Real 3D depth, no library: tracks the pointer and rotates the card in
// actual 3D space (perspective + rotateX/rotateY), which is what a mouse-
// driven "tilt" card needs to feel physical instead of just animated.
function TiltCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({
    transform: "perspective(1200px) rotateX(0deg) rotateY(0deg)",
  });

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setStyle({
      transform: `perspective(1200px) rotateX(${(-py * 9).toFixed(2)}deg) rotateY(${(px * 13).toFixed(2)}deg)`,
    });
  }
  function handleLeave() {
    setStyle({ transform: "perspective(1200px) rotateX(0deg) rotateY(0deg)" });
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={className}
      style={{ transition: "transform 0.5s cubic-bezier(0.2,0.7,0.2,1)", transformStyle: "preserve-3d", ...style }}
    >
      {children}
    </div>
  );
}

function Home() {
  const { data: programmes } = useProgrammes();
  const { data: courses } = useCourses();
  const liveProgrammeNames = (programmes ?? []).slice(0, 5).map((p) => p.name.replace(/^BSc |^BEng |^Bachelor of /, ""));

  return (
    <div className="min-h-screen bg-background pb-20">
      <SiteHeader />

      {/* HERO — dedicated gallery band up top, then the intro on a calm,
          gradient backdrop with faint drifting 3D glyphs behind the copy.
          The words are the point; the motion is just atmosphere. */}
      <HeroImageStrip />

      <section className="relative overflow-hidden bg-hero text-primary-foreground">
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden [perspective:1600px]">
          <div className="absolute left-1/2 top-0 h-[34rem] w-[50rem] -translate-x-1/2 rounded-full bg-copper/20 blur-[110px]" />
          <BookOpen strokeWidth={0.8} className="animate-hero-float-a absolute left-[6%] top-[16%] hidden h-20 w-20 text-gold/[0.18] sm:block lg:h-24 lg:w-24" />
          <GraduationCap strokeWidth={0.7} className="animate-hero-float-b absolute right-[8%] top-[24%] hidden h-24 w-24 text-copper/[0.16] sm:block lg:h-28 lg:w-28" style={{ animationDelay: "-3s" }} />
          <Layers strokeWidth={0.8} className="animate-hero-float-c absolute left-[16%] bottom-[10%] hidden h-16 w-16 text-teal/[0.18] sm:block" />
        </div>

        <div className="relative z-10 mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-14 sm:px-6 sm:pt-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-6 lg:pb-28 lg:pt-20">
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-gold/50 bg-gold/15 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-gold shadow-[0_0_24px_oklch(0.82_0.135_85_/_0.35)] backdrop-blur-sm">
              <Sparkles className="h-3.5 w-3.5" />
              Independent · Built by a CBU student
            </div>
            <h1 className="mt-6 font-display text-5xl leading-[0.98] tracking-tight text-white sm:text-6xl xl:text-7xl">
              Find. Learn. Revise.
              <br />
              <span className="text-gradient-gold drop-shadow-[0_0_44px_oklch(0.82_0.135_85_/_0.55)]">Repeat.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-lg text-base text-white/90 sm:text-lg lg:mx-0">
              The calm, focused study companion for Copperbelt University. Course notes, past papers and revision packs — one search away.
            </p>

            <div className="mx-auto mt-8 max-w-xl lg:mx-0">
              <SearchBar />
              <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs text-white/85 lg:justify-start">
                <span className="text-white/70">Try</span>
                {["CS 210", "Power Systems", "IFRS", "Dr. Chanda"].map((t) => (
                  <Link key={t} to="/search" search={{ q: t }} className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 font-semibold text-gold backdrop-blur transition-colors hover:bg-gold/20 hover:text-white">
                    {t}
                  </Link>
                ))}
              </div>
            </div>

            {liveProgrammeNames.length > 0 && (
              <div className="mx-auto mt-10 flex max-w-xl flex-wrap items-center justify-center gap-x-2 gap-y-3 border-t border-white/15 pt-6 text-xs text-white/85 lg:mx-0 lg:justify-start">
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-bold text-white">
                  <span className="h-1.5 w-1.5 rounded-full bg-copper shadow-[0_0_10px_oklch(0.66_0.14_50)]" /> Live now:
                </span>
                {liveProgrammeNames.map((p, i) => (
                  <span key={p} className="whitespace-nowrap">{p}{i < liveProgrammeNames.length - 1 && <span className="text-white/40">,</span>}</span>
                ))}
                <span className="whitespace-nowrap text-white/60">+ more added weekly</span>
              </div>
            )}
          </div>

          <div className="hidden lg:block">
            <div className="animate-float relative">
              <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gold/15 blur-3xl" />
              <TiltCard>
                <div className="rounded-3xl border border-white/15 bg-white/[0.08] p-6 shadow-elegant backdrop-blur-xl" style={{ transform: "translateZ(30px)" }}>
                  <div className="flex items-center gap-2 text-xs text-white/80">
                    <FileText className="h-3.5 w-3.5" /> Past Paper — Data Structures.pdf
                  </div>
                  <div className="mt-4 h-px bg-white/15" />
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {demoActions.map((a) => (
                      <div key={a.label} className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-xs font-semibold text-white">
                        <a.icon className="h-3.5 w-3.5 text-gold" /> {a.label}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 rounded-xl bg-white/10 p-3 text-xs leading-relaxed text-white/90">
                    <span className="font-bold text-white">Summary:</span> Six topics — arrays &amp; linked lists, trees &amp; graphs, sorting, hashing, dynamic programming, complexity.
                  </div>
                  <div className="mt-4 flex items-center justify-between rounded-xl bg-gold-gradient px-3 py-2 text-xs font-bold text-gold-foreground">
                    <span>Quiz ready</span><span>9/10</span>
                  </div>
                </div>
              </TiltCard>
            </div>
          </div>
        </div>
      </section>
      {/* BROWSE BY PROGRAMME */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <SectionHeader
          eyebrow="Browse" title="Pick your programme" subtitle="Jump straight to the year and course you need."
          action={<Link to="/browse" className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal hover:underline">All programmes <ArrowRight className="h-4 w-4" /></Link>}
        />
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(programmes ?? []).map((p, i) => (
            <Link
              key={p.code} to="/browse"
              className="group card-hover animate-fade-up rounded-2xl border border-border bg-card p-5 hover:border-primary/30 hover:shadow-soft hover:-translate-y-1"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className={`grid h-10 w-10 place-items-center rounded-xl ${p.accent === "gold" ? "bg-gold/20 text-copper" : p.accent === "copper" ? "bg-copper/15 text-copper" : "bg-teal/15 text-teal"}`}>
                <GraduationCap className="h-5 w-5" />
              </div>
              <div className="mt-4 text-sm font-semibold text-foreground">{p.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">{p.school}</div>
              <div className="mt-4 text-xs text-muted-foreground">{p.years} years</div>
            </Link>
          ))}
        </div>
      </section>

      {/* WHAT'S LIVE RIGHT NOW */}
      <section className="bg-surface-muted">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <SectionHeader eyebrow="What's live right now" title="Real courses, real material" subtitle="Learnova is early and growing in the open." />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(courses ?? []).map((c) => (<CourseCard key={c.code} course={c} />))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <SectionHeader eyebrow="How it works" title="From lost to studying in 3 steps" />
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            { icon: Compass, title: "Pick your path", desc: "Choose your programme and year — or search directly by course code or topic." },
            { icon: BookOpen, title: "Open the course", desc: "See the outline, notes, past papers and revision packs organised for you." },
            { icon: Zap, title: "Study smarter", desc: "Turn any document into a summary, flashcards or a practice quiz in seconds." },
          ].map((s, i) => (
            <div key={s.title} className="relative rounded-2xl border border-border bg-card p-6 transition-transform duration-300 hover:-translate-y-1">
              <div className="absolute -top-3 left-6 rounded-md bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">Step {i + 1}</div>
              <s.icon className="h-6 w-6 text-copper" />
              <h3 className="mt-4 text-lg font-semibold text-foreground">{s.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* WHY LEARNOVA */}
      <section className="bg-surface-muted">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-copper">Why Learnova</div>
              <h2 className="mt-3 font-display text-4xl leading-tight text-foreground sm:text-5xl">
                Built to make studying feel <span className="text-gradient-gold">effortless</span>.
              </h2>
              <p className="mt-4 max-w-md text-muted-foreground">Independent, calm and obsessively organised. No noise, no clutter — just the resources you need to move forward.</p>
              <ul className="mt-6 grid gap-3">
                {[
                  { icon: Layers, title: "Organised by programme", desc: "Programme → Year → Course. Always." },
                  { icon: Timer, title: "Fast on any phone", desc: "Optimised for low-data, quick-loading study sessions." },
                  { icon: Sparkles, title: "Open any document, get a study tool", desc: "One tap for a summary, flashcards, or a practice quiz." },
                ].map((f) => (
                  <li key={f.title} className="flex gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><f.icon className="h-4 w-4" /></div>
                    <div><div className="text-sm font-semibold text-foreground">{f.title}</div><div className="text-xs text-muted-foreground">{f.desc}</div></div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Streak / momentum mock — deliberately different from the hero card */}
            <div className="relative">
              <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-seam-line opacity-20 blur-2xl" />
              <div className="rounded-3xl border border-border bg-card p-6 shadow-elegant">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <Flame className="h-4 w-4 text-copper" /> 12-day streak
                  </div>
                  <span className="rounded-full bg-teal/15 px-2.5 py-0.5 text-[11px] font-semibold text-teal">On track</span>
                </div>
                <div className="mt-4 flex gap-1.5">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="h-6 flex-1 rounded-md bg-gradient-to-t from-copper to-gold opacity-90" style={{ animationDelay: `${i * 40}ms` }} />
                  ))}
                </div>
                <div className="mt-4 h-px bg-seam-line opacity-40" />
                <div className="mt-4 rounded-xl bg-surface-muted p-3">
                  <div className="text-xs font-semibold text-foreground">Next up</div>
                  <div className="mt-1 text-xs text-muted-foreground">Quiz · Financial Accounting II — 10 questions, ~6 min</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24">
        <div className="relative overflow-hidden rounded-3xl bg-hero p-8 text-primary-foreground shadow-elegant sm:p-12">
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-gold/20 blur-3xl" />
          <div className="absolute -bottom-20 left-1/4 h-56 w-56 rounded-full bg-copper/20 blur-3xl" />
          <div className="relative max-w-xl">
            <h2 className="font-display text-3xl leading-tight sm:text-4xl">Your next study session starts here.</h2>
            <p className="mt-3 text-primary-foreground/75">Create a free account and get a personal dashboard tailored to your programme and year.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/auth" className="inline-flex items-center gap-1.5 rounded-xl bg-gold-gradient px-5 py-3 text-sm font-bold text-gold-foreground hover:opacity-95">
                Create free account <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/browse" className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white backdrop-blur hover:bg-white/10">
                Browse programmes
              </Link>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
      <MobileTabBar />
    </div>
  );
}

function SectionHeader({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <div className="text-xs font-medium uppercase tracking-[0.2em] text-copper">{eyebrow}</div>
        <h2 className="mt-2 font-display text-3xl leading-tight text-foreground sm:text-4xl">{title}</h2>
        {subtitle && <p className="mt-2 max-w-xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
    }
