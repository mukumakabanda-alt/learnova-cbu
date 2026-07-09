import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { SiteHeader, SiteFooter, MobileTabBar } from "@/components/SiteHeader";
import { findCourse, materialTypeMeta, type Course, type Material } from "@/lib/mock-data";
import { ArrowLeft, Bookmark, Download, FileText, Sparkles, CheckCircle2, ListChecks, Lightbulb } from "lucide-react";

export const Route = createFileRoute("/courses/$code")({
  loader: ({ params }): { course: Course } => {
    const course = findCourse(params.code);
    if (!course) throw notFound();
    return { course };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.course.code} · ${loaderData.course.title} — Learnova` },
          { name: "description", content: `${loaderData.course.title} — notes, past papers and revision materials for ${loaderData.course.programme}, Year ${loaderData.course.year}.` },
          { property: "og:title", content: `${loaderData.course.code} — ${loaderData.course.title}` },
          { property: "og:url", content: `/courses/${loaderData.course.code.toLowerCase().replace(/\s+/g, "-")}` },
        ]
      : [{ title: "Course — Learnova" }],
  }),
  component: CoursePage,
  notFoundComponent: () => (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="font-display text-4xl">Course not found</h1>
        <p className="mt-2 text-muted-foreground">We couldn't find that course. Try browsing all programmes.</p>
        <Link to="/browse" className="mt-6 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Browse programmes</Link>
      </div>
    </div>
  ),
});

function CoursePage() {
  const { course } = Route.useLoaderData();

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <SiteHeader />

      <div className="border-b border-border bg-surface-muted">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
          <Link to="/browse" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to browse
          </Link>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md bg-primary px-2 py-1 font-semibold uppercase tracking-wide text-primary-foreground">{course.code}</span>
            <span className="rounded-md bg-surface px-2 py-1 font-medium text-muted-foreground">{course.programme}</span>
            <span className="rounded-md bg-surface px-2 py-1 font-medium text-muted-foreground">Year {course.year} · Sem {course.semester}</span>
            {course.lecturer && <span className="rounded-md bg-surface px-2 py-1 font-medium text-muted-foreground">{course.lecturer}</span>}
          </div>
          <h1 className="mt-4 font-display text-4xl leading-tight text-foreground sm:text-5xl">{course.title}</h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">{course.description}</p>

          <div className="mt-6 flex flex-wrap gap-2">
            <button className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft hover:opacity-95">
              <Bookmark className="h-4 w-4" /> Save course
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-xl bg-gold-gradient px-4 py-2.5 text-sm font-bold text-gold-foreground hover:opacity-95">
              <Sparkles className="h-4 w-4" /> Generate revision pack
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1fr_320px]">
        {/* MATERIALS */}
        <div>
          <h2 className="font-display text-2xl text-foreground">Materials</h2>
          <div className="mt-4 grid gap-3">
            {course.materials.map((m: Material) => (
              <div key={m.id} className="group card-hover flex items-center gap-4 rounded-2xl border border-border bg-card p-4 hover:border-primary/30 hover:shadow-soft">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><FileText className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-copper/10 px-2 py-0.5 text-[11px] font-semibold text-copper">{materialTypeMeta[m.type].label}</span>
                    {m.pages && <span className="text-[11px] text-muted-foreground">{m.pages} pages</span>}
                  </div>
                  <div className="mt-1 truncate text-sm font-semibold text-foreground">{m.title}</div>
                  <div className="text-xs text-muted-foreground">Updated {m.updated}</div>
                </div>
                <button className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-surface text-foreground transition-colors hover:bg-primary hover:text-primary-foreground">
                  <Download className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <h2 className="mt-10 font-display text-2xl text-foreground">Course outline</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {course.topics.map((t: string, i: number) => (
              <div key={t} className="flex items-start gap-3 rounded-xl border border-border bg-card p-3">
                <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-primary/10 text-[11px] font-semibold text-primary">{String(i + 1).padStart(2, "0")}</div>
                <div className="text-sm font-medium text-foreground">{t}</div>
              </div>
            ))}
          </div>
        </div>

        {/* SIDEBAR — STUDY TOOLS */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-copper">Study tools</div>
            <div className="mt-4 grid gap-2">
              {[
                { icon: Sparkles, label: "Auto summary" },
                { icon: ListChecks, label: "Flashcards" },
                { icon: CheckCircle2, label: "Quiz me" },
                { icon: Lightbulb, label: "Common question types" },
              ].map((t) => (
                <button key={t.label} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-muted">
                  <t.icon className="h-4 w-4 text-teal" /> {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-copper">In this course</div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <div className="font-display text-3xl text-foreground">{course.materials.length}</div>
              <div className="text-xs text-muted-foreground">materials available</div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Sign in to save this course and track what you've opened.</p>
          </div>

          <div className="rounded-2xl border border-dashed border-border bg-surface-muted p-5 text-sm text-muted-foreground">
            Missing something? <Link to="/dashboard" className="font-semibold text-teal hover:underline">Request material</Link>
          </div>
        </aside>
      </div>

      <SiteFooter />
      <MobileTabBar />
    </div>
  );
                    }
