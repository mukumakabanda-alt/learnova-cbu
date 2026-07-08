import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader, SiteFooter, MobileTabBar } from "@/components/SiteHeader";
import { courses, programmes } from "@/lib/mock-data";
import { Upload, Users, GraduationCap, FileText, TrendingUp, Inbox, Plus, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Learnova" },
      { name: "description", content: "Admin dashboard for managing programmes, courses, materials and student requests." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Admin,
});

function Admin() {
  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-copper">Admin</div>
            <h1 className="mt-2 font-display text-4xl leading-tight text-foreground sm:text-5xl">Learnova control room</h1>
            <p className="mt-2 max-w-lg text-sm text-muted-foreground">Manage programmes, courses, uploads and student requests.</p>
          </div>
          <button className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft">
            <Upload className="h-4 w-4" /> Upload material
          </button>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: FileText, label: "Materials", value: "2,431", trend: "+124 this week" },
            { icon: Users, label: "Students", value: "8,204", trend: "+312 this week" },
            { icon: GraduationCap, label: "Programmes", value: programmes.length.toString(), trend: "Stable" },
            { icon: Inbox, label: "Open requests", value: "17", trend: "3 urgent" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <s.icon className="h-4 w-4 text-teal" />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{s.trend}</span>
              </div>
              <div className="mt-3 font-display text-3xl text-foreground">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl text-foreground">Recent uploads</h2>
              <button className="inline-flex items-center gap-1 text-xs font-semibold text-teal hover:underline"><Plus className="h-3.5 w-3.5" /> Add</button>
            </div>
            <div className="mt-4 divide-y divide-border">
              {courses.slice(0, 5).map((c) => (
                <div key={c.code} className="flex items-center gap-4 py-3">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><FileText className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-foreground">{c.materials[0]?.title}</div>
                    <div className="truncate text-xs text-muted-foreground">{c.code} · {c.materials[0]?.type} · {c.materials[0]?.updated}</div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-md bg-teal/10 px-2 py-0.5 text-[11px] font-semibold text-teal">
                    <CheckCircle2 className="h-3 w-3" /> Approved
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-xl text-foreground">Missing requests</h2>
            <div className="mt-4 space-y-3">
              {[
                { code: "CS 320", note: "Compilers notes 2024", who: "Mwape N." },
                { code: "BBA 410", note: "Strategy past papers", who: "Bwalya K." },
                { code: "EE 220", note: "Circuits summary", who: "Tembo L." },
              ].map((r) => (
                <div key={r.note} className="rounded-xl border border-border bg-surface p-3">
                  <div className="flex items-center justify-between">
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{r.code}</span>
                    <span className="text-[11px] text-muted-foreground">{r.who}</span>
                  </div>
                  <div className="mt-1.5 text-sm font-medium text-foreground">{r.note}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
            <h2 className="font-display text-xl text-foreground">Trending courses</h2>
            <div className="mt-4 grid gap-2">
              {courses.filter((c) => c.trending).map((c) => (
                <div key={c.code} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
                  <TrendingUp className="h-4 w-4 text-copper" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-foreground">{c.code} · {c.title}</div>
                    <div className="text-xs text-muted-foreground">{c.saves.toLocaleString()} saves</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-xl text-foreground">Programmes</h2>
            <div className="mt-4 space-y-2 text-sm">
              {programmes.slice(0, 5).map((p) => (
                <div key={p.code} className="flex items-center justify-between">
                  <span className="truncate text-foreground">{p.name}</span>
                  <span className="text-xs text-muted-foreground">{p.courses}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <SiteFooter />
      <MobileTabBar />
    </div>
  );
}
