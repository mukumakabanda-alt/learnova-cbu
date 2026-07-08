import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader, SiteFooter, MobileTabBar } from "@/components/SiteHeader";
import { CourseCard } from "@/components/CourseCard";
import { courses } from "@/lib/mock-data";
import { Flame, Clock, Bookmark, Bell, Plus } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Your dashboard — Learnova" },
      { name: "description", content: "Your personal Learnova dashboard: saved materials, recent courses and study reminders." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const saved = courses.slice(0, 3);
  const recent = courses.slice(2, 5);

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <SiteHeader />

      <section className="bg-hero text-primary-foreground">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-gold">Welcome back</div>
          <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">Hi, Chanda 👋</h1>
          <p className="mt-2 max-w-lg text-primary-foreground/75">BSc Computer Science · Year 2 · Semester 1</p>

          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { k: "12", v: "Saved materials", icon: Bookmark },
              { k: "4", v: "Day streak", icon: Flame },
              { k: "8h", v: "This week", icon: Clock },
              { k: "3", v: "Reminders", icon: Bell },
            ].map((s) => (
              <div key={s.v} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <s.icon className="h-4 w-4 text-gold" />
                <div className="mt-3 font-display text-2xl">{s.k}</div>
                <div className="text-xs text-primary-foreground/70">{s.v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 md:grid-cols-[1fr_300px]">
        <div className="space-y-10">
          <section>
            <div className="flex items-end justify-between">
              <h2 className="font-display text-2xl text-foreground">Continue where you left off</h2>
              <Link to="/browse" className="text-sm font-semibold text-teal hover:underline">Browse all</Link>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {recent.map((c) => (<CourseCard key={c.code} course={c} />))}
            </div>
          </section>

          <section>
            <h2 className="font-display text-2xl text-foreground">Saved materials</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {saved.map((c) => (<CourseCard key={c.code} course={c} />))}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-copper">Upcoming</div>
            <ul className="mt-3 space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <div className="mt-0.5 grid h-8 w-8 place-items-center rounded-lg bg-copper/10 text-copper text-[11px] font-bold">15 NOV</div>
                <div><div className="font-medium text-foreground">CS 210 Assignment 2</div><div className="text-xs text-muted-foreground">Due in 4 days</div></div>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-0.5 grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary text-[11px] font-bold">22 NOV</div>
                <div><div className="font-medium text-foreground">Mid-semester exams</div><div className="text-xs text-muted-foreground">Study plan ready</div></div>
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-copper">Request material</div>
            <p className="mt-2 text-sm text-muted-foreground">Can't find what you need? Ask and we'll notify you when it's added.</p>
            <button className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
              <Plus className="h-4 w-4" /> New request
            </button>
          </div>
        </aside>
      </div>

      <SiteFooter />
      <MobileTabBar />
    </div>
  );
}
