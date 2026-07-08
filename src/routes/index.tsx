import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader, SiteFooter, MobileTabBar } from "@/components/SiteHeader";
import { SearchBar } from "@/components/SearchBar";
import { CourseCard } from "@/components/CourseCard";
import { courses, programmes } from "@/lib/mock-data";
import { ArrowRight, BookOpen, Compass, GraduationCap, Sparkles, Timer, Bookmark, Zap, Layers } from "lucide-react";
import campusQuad from "@/assets/campus-quad.asset.json";
import campusBuildings from "@/assets/campus-buildings.asset.json";
import graduation from "@/assets/graduation.asset.json";
import campusGarden from "@/assets/campus-garden.asset.json";

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

function Home() {
  const popular = courses.filter((c) => c.trending).slice(0, 3);
  const recent = courses.slice(0, 4);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* HERO */}
      <section className="relative overflow-hidden bg-hero text-primary-foreground">
        <div
          className="absolute inset-0 opacity-25 mix-blend-overlay"
          style={{ backgroundImage: `url(${campusQuad.url})`, backgroundSize: "cover", backgroundPosition: "center" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-primary/80" />
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24 md:pb-24">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-gold">
            <Sparkles className="h-3.5 w-3.5" />
            Independent · For CBU students
          </div>
          <h1 className="mt-5 max-w-3xl font-display text-5xl leading-[1.05] tracking-tight sm:text-6xl md:text-7xl">
            Find. Learn. Revise.
            <br />
            <span className="text-gradient-gold">Repeat.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-primary-foreground/75 sm:text-lg">
            The calm, focused study companion for Copperbelt University. Course notes, past papers, revision packs — one search away.
          </p>

          <div className="mt-8 max-w-2xl">
            <SearchBar />
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-primary-foreground/70">
              <span>Try</span>
              {["CS 210", "Power Systems", "IFRS", "Dr. Chanda"].map((t) => (
                <Link
                  key={t}
                  to="/search"
                  search={{ q: t }}
                  className="rounded-full border border-white/15 bg-white/5 px-3 py-1 backdrop-blur transition-colors hover:bg-white/10 hover:text-white"
                >
                  {t}
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-10 grid grid-cols-3 gap-4 border-t border-white/10 pt-6 sm:max-w-lg">
            {[
              { k: "8", v: "Programmes" },
              { k: "300+", v: "Courses" },
              { k: "2.4k", v: "Materials" },
            ].map((s) => (
              <div key={s.v}>
                <div className="font-display text-3xl text-gold">{s.k}</div>
                <div className="text-xs text-primary-foreground/70">{s.v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BROWSE BY PROGRAMME */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <SectionHeader
          eyebrow="Browse"
          title="Pick your programme"
          subtitle="Jump straight to the year, semester and course you need."
          action={<Link to="/browse" className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal hover:underline">All programmes <ArrowRight className="h-4 w-4" /></Link>}
        />
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {programmes.slice(0, 8).map((p) => (
            <Link
              key={p.code}
              to="/browse"
              className="group card-hover rounded-2xl border border-border bg-card p-5 hover:border-primary/30 hover:shadow-soft"
            >
              <div className={`grid h-10 w-10 place-items-center rounded-xl ${p.accent === "gold" ? "bg-gold/20 text-copper" : p.accent === "copper" ? "bg-copper/15 text-copper" : "bg-teal/15 text-teal"}`}>
                <GraduationCap className="h-5 w-5" />
              </div>
              <div className="mt-4 text-sm font-semibold text-foreground">{p.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">{p.school}</div>
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>{p.years} years</span>
                <span>{p.courses} courses</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* POPULAR COURSES */}
      <section className="bg-surface-muted">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <SectionHeader
            eyebrow="Popular this week"
            title="Where students are studying"
            subtitle="The courses your peers are opening most right now."
          />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {popular.map((c) => (<CourseCard key={c.code} course={c} />))}
          </div>
        </div>
      </section>

      {/* NEWLY ADDED */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <SectionHeader
          eyebrow="Freshly uploaded"
          title="Newly added materials"
          subtitle="The latest notes, papers and summaries from across CBU programmes."
        />
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {recent.map((c) => (
            <div key={c.code} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">{c.code}</span>
                <span className="text-xs text-muted-foreground">{c.materials[0]?.updated}</span>
              </div>
              <h3 className="mt-3 text-base font-semibold text-foreground">{c.materials[0]?.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{c.title} · {c.materials[0]?.type}</p>
              <div className="mt-4 flex items-center gap-2">
                <Link to="/courses/$code" params={{ code: c.code.toLowerCase().replace(/\s+/g, "-") }} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-95">
                  Open course
                </Link>
                <button className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted">
                  <Bookmark className="h-3.5 w-3.5" /> Save
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="bg-surface-muted">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <SectionHeader eyebrow="How it works" title="From lost to studying in 3 steps" />
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              { icon: Compass, title: "Pick your path", desc: "Choose your programme, year and semester — or search directly by course code or topic." },
              { icon: BookOpen, title: "Open the course", desc: "See the outline, notes, past papers and revision packs organised for you." },
              { icon: Zap, title: "Study smarter", desc: "Save materials, track progress, and jump back into where you left off — anywhere." },
            ].map((s, i) => (
              <div key={s.title} className="relative rounded-2xl border border-border bg-card p-6">
                <div className="absolute -top-3 left-6 rounded-md bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">Step {i + 1}</div>
                <s.icon className="h-6 w-6 text-copper" />
                <h3 className="mt-4 text-lg font-semibold text-foreground">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHY LEARNOVA */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="grid gap-10 md:grid-cols-2 md:items-center">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-copper">Why Learnova</div>
            <h2 className="mt-3 font-display text-4xl leading-tight text-foreground sm:text-5xl">
              Built to make studying feel <span className="text-gradient-gold">effortless</span>.
            </h2>
            <p className="mt-4 max-w-md text-muted-foreground">
              Learnova is independent, calm and obsessively organised — inspired by the CBU student experience. No noise, no clutter, just the resources you need to move forward.
            </p>
            <ul className="mt-6 grid gap-3">
              {[
                { icon: Layers, title: "Organised by programme", desc: "Programme → Year → Semester → Course. Always." },
                { icon: Timer, title: "Fast on any phone", desc: "Optimised for low-data, quick loading study sessions." },
                { icon: Sparkles, title: "Smart study tools", desc: "Summaries, key topics and revision packs — ready to use." },
              ].map((f) => (
                <li key={f.title} className="flex gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><f.icon className="h-4 w-4" /></div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">{f.title}</div>
                    <div className="text-xs text-muted-foreground">{f.desc}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <img src={campusBuildings.url} alt="Campus" className="col-span-2 h-48 w-full rounded-2xl object-cover shadow-soft" />
            <img src={graduation.url} alt="Graduation procession" className="h-40 w-full rounded-2xl object-cover shadow-soft" />
            <img src={campusGarden.url} alt="Campus garden" className="h-40 w-full rounded-2xl object-cover shadow-soft" />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24">
        <div className="relative overflow-hidden rounded-3xl bg-hero p-8 text-primary-foreground shadow-elegant sm:p-12">
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-gold/20 blur-3xl" />
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
