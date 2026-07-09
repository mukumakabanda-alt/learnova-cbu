import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader, SiteFooter, MobileTabBar } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/use-auth";
import { useCatalog, useOpenRequests, useProgrammes, useCourses, useCreateCourse } from "@/lib/queries";
import { DocumentUpload } from "@/components/DocumentUpload";
import { useState } from "react";
import { Users, GraduationCap, FileText, Inbox, Plus, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin — Learnova" }, { name: "robots", content: "noindex" }],
  }),
  component: Admin,
});

function Admin() {
  const { user, profile, isAdmin, loading } = useAuth();
  const { data: materials } = useCatalog();
  const { data: requests } = useOpenRequests();
  const { data: programmes } = useProgrammes();
  const { data: courses } = useCourses();
  const qc = useQueryClient();

  if (loading) return null;
  if (!user || !profile) {
    if (typeof window !== "undefined") window.location.href = "/auth";
    return null;
  }
  // Real gate — RLS on the database enforces this too, this is just the UX layer.
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto max-w-md px-4 py-24 text-center">
          <h1 className="font-display text-2xl text-foreground">Not authorised</h1>
          <p className="mt-2 text-sm text-muted-foreground">This account doesn't have admin access.</p>
        </div>
      </div>
    );
  }

  async function fulfilRequest(id: string) {
    await supabase.from("material_requests").update({ status: "fulfilled" }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["requests"] });
  }

  const openRequests = (requests ?? []).filter((r) => r.status === "open");
  const ready = (materials ?? []).filter((m) => m.status === "ready");

  return (
    <div className="min-h-screen bg-background pb-20">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="text-xs font-medium uppercase tracking-[0.2em] text-copper">Admin</div>
        <h1 className="mt-2 font-display text-4xl leading-tight text-foreground sm:text-5xl">Learnova control room</h1>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: FileText, label: "Materials ready", value: ready.length },
            { icon: Users, label: "Students", value: "—" },
            { icon: GraduationCap, label: "Programmes", value: programmes?.length ?? 0 },
            { icon: Inbox, label: "Open requests", value: openRequests.length },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-border bg-card p-5">
              <s.icon className="h-4 w-4 text-teal" />
              <div className="mt-3 font-display text-3xl text-foreground">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
            <h2 className="font-display text-xl text-foreground">Add a catalogue material</h2>
            <p className="mt-1 text-xs text-muted-foreground">Uploads here run through the same pipeline as student uploads and can be tagged to any course.</p>
            <div className="mt-4"><DocumentUpload /></div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-xl text-foreground">Open requests</h2>
            <div className="mt-4 space-y-2">
              {openRequests.length === 0 && <p className="text-sm text-muted-foreground">Nothing open right now.</p>}
              {openRequests.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface p-3">
                  <div className="min-w-0"><div className="truncate text-sm font-medium text-foreground">{r.title}</div>{r.courses?.title && <div className="text-xs text-muted-foreground">{r.courses.title}</div>}</div>
                  <button onClick={() => fulfilRequest(r.id)} className="shrink-0 rounded-lg bg-primary/10 p-1.5 text-primary hover:bg-primary/20"><CheckCircle2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
            <h2 className="font-display text-xl text-foreground">Recently processed</h2>
            <div className="mt-4 divide-y divide-border">
              {ready.slice(0, 6).map((m) => (
                <div key={m.id} className="flex items-center gap-4 py-3">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><FileText className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-foreground">{m.title}</div><div className="truncate text-xs text-muted-foreground">{m.courses?.code ?? "General"}</div></div>
                </div>
              ))}
            </div>
          </div>

          <NewCourseCard programmes={programmes ?? []} />
        </div>

        <div className="mt-6 rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display text-xl text-foreground">Courses ({courses?.length ?? 0})</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {(courses ?? []).map((c) => (
              <div key={c.code} className="flex items-center justify-between rounded-xl border border-border bg-surface p-3 text-sm">
                <span className="truncate text-foreground">{c.code} · {c.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">Y{c.year}S{c.semester}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <SiteFooter />
      <MobileTabBar />
    </div>
  );
}

function NewCourseCard({ programmes }: { programmes: { code: string; name: string }[] }) {
  const createCourse = useCreateCourse();
  const [form, setForm] = useState({ code: "", title: "", programmeCode: programmes[0]?.code ?? "", year: 1, semester: 1 as 1 | 2, lecturer: "" });

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-xl text-foreground">New course</h2>
      <form
        className="mt-3 space-y-2"
        onSubmit={(e) => { e.preventDefault(); createCourse.mutate(form, { onSuccess: () => setForm({ ...form, code: "", title: "", lecturer: "" }) }); }}
      >
        <input required placeholder="Code (e.g. CS 220)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-full rounded-xl border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
        <input required placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-xl border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
        <select value={form.programmeCode} onChange={(e) => setForm({ ...form, programmeCode: e.target.value })} className="w-full rounded-xl border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none">
          {programmes.map((p) => (<option key={p.code} value={p.code}>{p.name}</option>))}
        </select>
        <div className="flex gap-2">
          <select value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} className="w-1/2 rounded-xl border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none">
            {[1, 2, 3, 4, 5].map((y) => (<option key={y} value={y}>Year {y}</option>))}
          </select>
          <select value={form.semester} onChange={(e) => setForm({ ...form, semester: Number(e.target.value) as 1 | 2 })} className="w-1/2 rounded-xl border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none">
            <option value={1}>Semester 1</option><option value={2}>Semester 2</option>
          </select>
        </div>
        <button type="submit" disabled={createCourse.isPending} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          <Plus className="h-4 w-4" /> Add course
        </button>
      </form>
    </div>
  );
    }
