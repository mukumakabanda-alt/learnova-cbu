import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader, SiteFooter, MobileTabBar } from "@/components/SiteHeader";
import { CourseCard } from "@/components/CourseCard";
import { courses } from "@/lib/mock-data";
import { Flame, Clock, Bookmark, Bell, Plus, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Your dashboard — Learnova" },
      { name: "description", content: "Your personal Learnova dashboard: saved materials, recent courses and study reminders." },
    ],
  }),
  component: Dashboard,
});

// Illustrative only — not tied to a real account yet, so nothing here claims to be your history.
const startHere = courses.slice(0, 4);

function Dashboard() {
  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <SiteHeader />

      <section className="bg-hero text-primary-foreground">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-gold">Preview</div>
          <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">Your dashboard, once you sign in</h1>
          <p className="mt-2 max-w-lg text-primary-foreground/75">Saved materials, a study streak, and reminders tailored to your programme and year — all live here once you have an account.</p>
          <Link to="/auth" className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-gold-gradient px-5 py-2.5 text-sm font-bold text-gold-foreground hover:opacity-95">
            Create free account <ArrowRight className="h-4 w-4" />
          </Link>

          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { v: "Saved materials", icon: Bookmark },
              { v: "Day streak", icon: Flame },
              { v: "This week", icon: Clock },
              { v: "Reminders", icon: Bell },
            ].map((s) => (
              <div key={s.v} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <s.icon className="h-4 w-4 text-gold" />
                <div className="mt-3 font-display text-2xl text-primary-foreground/35">—</div>
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
              <h2 className="font-display text-2xl text-foreground">Start with these</h2>
              <Link to="/browse" className="text-sm font-semibold text-teal hover:underline">Browse all</Link>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {startHere.map((c) => (<CourseCard key={c.code} course={c} />))}
            </div>
          </section>

          <section>
            <h2 className="font-display text-2xl text-foreground">Saved materials</h2>
            <div className="mt-4 rounded-2xl border border-dashed border-border bg-surface-muted p-8 text-center">
              <div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-surface text-copper"><Bookmark className="h-5 w-5" /></div>
              <p className="mx-auto mt-3 max-w-xs text-sm text-muted-foreground">Nothing saved yet. Tap the bookmark on any course to keep it here.</p>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-copper">Upcoming</div>
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">Example</span>
            </div>
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
            <p className="mt-3 text-[11px] text-muted-foreground">This is what it'll look like — real dates come from your registered courses once accounts are live.</p>
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
