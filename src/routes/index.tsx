import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader, SiteFooter, MobileTabBar } from "@/components/SiteHeader";
import { SearchBar } from "@/components/SearchBar";
import { CourseCard } from "@/components/CourseCard";
import { courses, programmes } from "@/lib/mock-data";
import {
  ArrowRight,
  BookOpen,
  Compass,
  GraduationCap,
  Sparkles,
  Timer,
  Zap,
  Layers,
  FileText,
  ListChecks,
  MessageCircle,
} from "lucide-react";
import campusBuildings from "@/assets/campus-buildings.asset.json";
import campusGate from "@/assets/campus-gate.asset.json";

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

const liveProgrammes = ["Computer Science", "Electrical Engineering", "Business Admin", "Mining Engineering", "Architecture"];

const demoActions = [
  { icon: FileText, label: "Summary" },
  { icon: Layers, label: "Flashcards" },
  { icon: ListChecks, label: "Practice quiz" },
  { icon: MessageCircle, label: "Ask a question" },
];

function Home() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* HERO */}
      <section className="relative overflow-hidden bg-hero text-primary-foreground">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-copper/25 blur-3xl" />
          <div className="absolute right-0 top-0 h-80 w-80 rounded-full bg-gold/10 blur-3xl" />
          <div className="absolute inset-x-0 top-0 h-px bg-seam-line opacity-60" />
        </div>

        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 pb-14 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-10 lg:pb-24 lg:pt-24">
          {/* copy + search */}
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-gold">
              <Sparkles className="h-3.5 w-3.5" />
              Independent · Built by a CBU student
            </div>
            <h1 className="mt-5 font-display text-5xl leading-[1.05] tracking-tight sm:text-6xl xl:text-7xl">
              Find. Learn. Revise.
              <br />
              <span className="text-gradient-gold">Repeat.</span>
            </h1>
            <p className="mt-5 max-w-lg text-base text-primary-foreground/75 sm:text-lg">
              The calm, focused study companion for Copperbelt University. Course notes, past papers and revision packs — one search away.
            </p>

            <div className="mt-8 max-w-xl">
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

            {/* Honest coverage signal — real programmes with real material, not a vanity number */}
            <div className="mt-10 flex flex-wrap items-center gap-x-2 gap-y-3 border-t border-white/10 pt-6 text-xs text-primary-foreground/70">
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-semibold text-primary-foreground/90">
                <span className="h-1.5 w-1.5 rounded-full bg-copper" /> Live now:
              </span>
              {liveProgrammes.map((p, i) => (
                <span key={p} className="whitespace-nowrap">
                  {p}{i < liveProgrammes.length - 1 && <span className="text-primary-foreground/40">,</span>}
                </span>
              ))}
              <span className="whitespace-nowrap text-primary-foreground/45">+ more added weekly</span>
            </div>
          </div>

          {/* campus photography — offset composition */}
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div className="absolute -inset-6 -z-10 hidden rounded-[2rem] bg-seam-line opacity-25 blur-2xl lg:block" />
            <img
              src={campusBuildings.url}
              alt="Copperbelt University campus buildings"
              className="aspect-[4/3] w-full rounded-3xl border border-white/10 object-cover shadow-elegant"
            />
            <img
              src={campusGate.url}
              alt="Copperbelt University main gate"
              className="absolute -bottom-6 -left-4 hidden aspect-[4/3] w-36 rounded-2xl border-4 border-background object-cover shadow-elegant sm:w-44 md:block"
            />
            <div className="absolute -bottom-4 right-3 flex items-center gap-1.5 rounded-full border border-white/15 bg-background/80 px-3 py-1.5 text-[11px] font-medium backdrop-blur-xl">
              <span className="h-1.5 w-1.5 rounded-full bg-copper" /> Riverside Campus, Kitwe
            </div>
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
          {programmes.map((p) => (
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

      {/* WHAT'S LIVE RIGHT NOW — real courses only, no invented popularity */}
      <section className="bg-surface-muted">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <SectionHeader
            eyebrow="What's live right now"
            title="Real courses, real material"
            subtitle="Learnova is early and growing in the open — every course below already has real notes and past papers behind it, not placeholders."
          />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((c) => (<CourseCard key={c.code} course={c} />))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <SectionHeader eyebrow="How it works" title="From lost to studying in 3 steps" />
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            { icon: Compass, title: "Pick your path", desc: "Choose your programme, year and semester — or search directly by course code or topic." },
            { icon: BookOpen, title: "Open the course", desc: "See the outline, notes, past papers and revision packs organised for you." },
            { icon: Zap, title: "Study smarter", desc: "Turn any document into a summary, flashcards or a practice quiz in seconds." },
          ].map((s, i) => (
            <div key={s.title} className="relative rounded-2xl border border-border bg-card p-6">
              <div className="absolute -top-3 left-6 rounded-md bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">Step {i + 1}</div>
              <s.icon className="h-6 w-6 text-copper" />
              <h3 className="mt-4 text-lg font-semibold text-foreground">{s.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* WHY LEARNOVA — the study tool, shown, not just claimed */}
      <section className="bg-surface-muted">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
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
                  { icon: Timer, title: "Fast on any phone", desc: "Optimised for low-data, quick-loading study sessions." },
                  { icon: Sparkles, title: "Open any document, get a study tool", desc: "One tap for a summary, flashcards, a practice quiz, or to ask it a question." },
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

            {/* mini product demo — makes the AI study tool concrete instead of a vague promise */}
            <div className="relative">
              <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-seam-line opacity-20 blur-2xl" />
              <div className="rounded-3xl border border-border bg-card p-6 shadow-elegant">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" /> Complete Course Notes 2025.pdf
                </div>
                <div className="mt-4 h-px bg-seam-line opacity-40" />
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {demoActions.map((a) => (
                    <div key={a.label} className="flex items-center gap-2 rounded-xl border border-border bg-surface-muted px-3 py-2.5 text-xs font-semibold text-foreground">
                      <a.icon className="h-3.5 w-3.5 text-copper" /> {a.label}
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-xl bg-surface-muted p-3 text-xs leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">Summary:</span> This document covers six topics — arrays &amp; linked lists, trees &amp; graphs, sorting, hashing, dynamic programming, and complexity analysis.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
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
