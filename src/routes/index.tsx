import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader, SiteFooter, MobileTabBar } from "@/components/SiteHeader";
import { SearchBar } from "@/components/SearchBar";
import { CourseCard } from "@/components/CourseCard";
import { HeroImageStrip } from "@/components/HeroCarousel";
import { useProgrammes, usePopularCourses, usePopularMaterials } from "@/lib/queries";
import { ArrowRight, Compass, BookOpen, Zap } from "lucide-react";

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

// Refined homepage: two colors do the heavy lifting (navy ground,
// copper/gold accent). Every section gets air. No streak card, no
// tilt gimmick, no "why us" wall of text — those live elsewhere.
function Home() {
  const { data: programmes } = useProgrammes();
  // Both of these only ever reflect genuine engagement (real likes and
  // downloads) — see usePopularCourses/usePopularMaterials in queries.ts.
  // Neither pads its result out with recent-but-unproven material, so an
  // empty array here is a completely normal state for a young catalogue,
  // not a bug — and every section below hides itself completely rather
  // than showing something fake when that happens.
  const { data: popularCourses } = usePopularCourses(6);
  const { data: popularMaterials } = usePopularMaterials(8);

  // De-duplicated course codes (falling back to the material's own title
  // for anything with no course tag) from whatever's actually trending —
  // replaces the old hardcoded "CS 210 / Power Systems / IFRS" chips, none
  // of which were ever backed by a real document anyone had opened.
  const trendingChips = Array.from(
    new Set((popularMaterials ?? []).map((m) => m.courses?.code || m.title).filter(Boolean)),
  ).slice(0, 4);

  return (
    <div className="min-h-screen bg-background pb-24">
      <SiteHeader />

      {/* 1. HERO IMAGE — dedicated crossfade frame, unchanged size/position */}
      <HeroImageStrip />

      {/* 2. HEADLINE + SEARCH — quiet, centered, plenty of breathing room */}
      <section className="mx-auto max-w-3xl px-4 pb-4 pt-10 text-center sm:px-6 sm:pt-14">
        <h1 className="font-display text-4xl leading-[1.05] tracking-tight text-foreground sm:text-6xl">
          Find. Learn. Revise.{" "}
          <span className="text-gradient-gold">Repeat.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
          The calm study companion for Copperbelt University students.
        </p>

        <div className="mx-auto mt-10 max-w-xl">
          <SearchBar />
          {trendingChips.length > 0 && (
            <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs">
              <span className="text-muted-foreground">Trending</span>
              {trendingChips.map((t) => (
                <Link
                  key={t}
                  to="/search"
                  search={{ q: t }}
                  className="rounded-full border border-border bg-surface px-3 py-1 font-medium text-foreground/85 transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {t}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 3. TOP PICKS — only appears once something has real engagement (likes/downloads); no placeholder content */}
      {(popularCourses?.length ?? 0) > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-20 sm:px-6 sm:pt-28">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-copper">Top picks</div>
              <h2 className="mt-2 font-display text-3xl leading-tight text-foreground sm:text-4xl">
                Popular courses right now
              </h2>
            </div>
            <Link to="/browse" className="hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-copper hover:underline sm:inline-flex">
              Browse all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {popularCourses!.map((c) => (<CourseCard key={c.code} course={c} />))}
          </div>
        </section>
      )}

      {/* 4. BROWSE BY PROGRAMME — minimal chip strip */}
      <section className="mx-auto max-w-6xl px-4 pt-20 sm:px-6 sm:pt-28">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-copper">Browse</div>
        <h2 className="mt-2 font-display text-3xl leading-tight text-foreground sm:text-4xl">
          Pick your programme
        </h2>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(programmes ?? []).map((p) => (
            <Link
              key={p.code}
              to="/browse"
              className="group flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">{p.name}</div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">{p.school}</div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-copper" />
            </Link>
          ))}
        </div>
      </section>

      {/* 5. HOW IT WORKS — kept small, one row */}
      <section className="mx-auto max-w-6xl px-4 pt-20 sm:px-6 sm:pt-28">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-copper">How it works</div>
        <h2 className="mt-2 font-display text-3xl leading-tight text-foreground sm:text-4xl">
          Studying, in three taps
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            { icon: Compass, title: "Pick your path", desc: "Programme, year, course." },
            { icon: BookOpen, title: "Open the material", desc: "Notes, past papers, summaries — organised." },
            { icon: Zap, title: "Study smarter", desc: "Summaries, flashcards and quizzes on tap." },
          ].map((s, i) => (
            <div key={s.title} className="rounded-2xl border border-border bg-card p-6">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Step {i + 1}</div>
              <s.icon className="mt-3 h-5 w-5 text-copper" />
              <h3 className="mt-3 text-base font-semibold text-foreground">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 6. CTA — high contrast, no invisible text (was primary-foreground on hero bg) */}
      <section className="mx-auto max-w-6xl px-4 pb-20 pt-20 sm:px-6 sm:pb-28 sm:pt-28">
        <div className="relative overflow-hidden rounded-3xl bg-hero p-10 shadow-elegant sm:p-14">
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-gold/20 blur-3xl" />
          <div className="relative max-w-xl">
            <h2 className="font-display text-3xl leading-tight text-white sm:text-4xl">
              Your next study session starts here.
            </h2>
            <p className="mt-3 text-white/75">
              Create a free account for a personal dashboard tailored to your programme and year.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/auth" className="inline-flex items-center gap-1.5 rounded-xl bg-gold-gradient px-5 py-3 text-sm font-bold text-gold-foreground hover:opacity-95">
                Create free account <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/browse" className="inline-flex items-center gap-1.5 rounded-xl border border-white/25 bg-white/5 px-5 py-3 text-sm font-semibold text-white backdrop-blur hover:bg-white/10">
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
