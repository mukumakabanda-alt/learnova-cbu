import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader, SiteFooter, MobileTabBar } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/use-auth";
import {
  useCatalog, useOpenRequests, useProgrammes, useCreateProgramme, useUpdateProgramme, useDeleteProgramme,
  useCourses, useCreateCourse, useUpdateCourse, useDeleteCourse, useAdminMaterials, useUpdateMaterial, useDeleteMaterial,
  useHeroSlides, useAddHeroSlide, useDeleteHeroSlide, useReorderHeroSlide,
  useAllStudents, useAllUserRoles, usePromoteToAdmin, useDemoteFromAdmin,
  type CourseWithProgramme, type MaterialWithCourse, type HeroSlide,
} from "@/lib/queries";
import type { Database } from "@/integrations/supabase/types";
import { DocumentUpload } from "@/components/DocumentUpload";
import { useRef, useState } from "react";
import {
  Users, GraduationCap, FileText, Inbox, Plus, CheckCircle2, ShieldCheck, KeyRound, Info,
  Pencil, Trash2, ArrowUp, ArrowDown, Upload as UploadIcon, Search, Crown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin — Learnova" }, { name: "robots", content: "noindex" }],
  }),
  component: Admin,
});

type Tab = "overview" | "materials" | "carousel" | "programmes" | "courses" | "students";
type ProgrammeRow = Database["public"]["Tables"]["programmes"]["Row"];

function Admin() {
  const { user, profile, isAdmin, loading, signIn, signUp } = useAuth();
  const { data: materials } = useCatalog();
  const { data: requests } = useOpenRequests();
  const { data: programmes } = useProgrammes();
  const { data: courses } = useCourses();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");

  if (loading) return <div className="min-h-screen bg-background" />;

  // Not signed in → inline auth on the admin page itself. No redirect.
  if (!user || !profile) {
    return <AdminAuthGate signIn={signIn} signUp={signUp} />;
  }

  // Signed in but not admin → claim panel with self-service instructions.
  if (!isAdmin) {
    return <AdminClaimGate userId={user.id} />;
  }

  async function fulfilRequest(id: string) {
    await supabase.from("material_requests").update({ status: "fulfilled" }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["requests"] });
  }

  const openRequests = (requests ?? []).filter((r) => r.status === "open");
  const ready = (materials ?? []).filter((m) => m.status === "ready");

  const TABS: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "materials", label: "Materials" },
    { id: "carousel", label: "Carousel" },
    { id: "programmes", label: "Programmes" },
    { id: "courses", label: "Courses" },
    { id: "students", label: "Students" },
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-copper">Admin</div>
        <h1 className="mt-2 font-display text-4xl leading-tight text-foreground sm:text-5xl">Learnova control room</h1>

        <div className="mt-8 flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
                tab === t.id ? "bg-primary text-primary-foreground" : "bg-surface-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <OverviewTab
            materials={materials ?? []}
            ready={ready}
            programmes={programmes ?? []}
            courses={courses ?? []}
            openRequests={openRequests}
            fulfilRequest={fulfilRequest}
          />
        )}
        {tab === "materials" && <MaterialsManager courses={courses ?? []} />}
        {tab === "carousel" && <CarouselManager />}
        {tab === "programmes" && <ProgrammesManager programmes={programmes ?? []} courses={courses ?? []} />}
        {tab === "courses" && <CoursesManager programmes={programmes ?? []} courses={courses ?? []} />}
        {tab === "students" && <StudentsManager currentUserId={user.id} />}
      </div>
      <SiteFooter />
      <MobileTabBar />
    </div>
  );
}

// ── Overview ────────────────────────────────────────────────────────────
function OverviewTab({
  materials, ready, programmes, courses, openRequests, fulfilRequest,
}: {
  materials: MaterialWithCourse[];
  ready: MaterialWithCourse[];
  programmes: { code: string; name: string }[];
  courses: CourseWithProgramme[];
  openRequests: { id: string; title: string; courses: { title: string } | null }[];
  fulfilRequest: (id: string) => void;
}) {
  return (
    <>
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: FileText, label: "Materials ready", value: ready.length },
          { icon: Users, label: "Students", value: "—" },
          { icon: GraduationCap, label: "Programmes", value: programmes.length },
          { icon: Inbox, label: "Open requests", value: openRequests.length },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-card p-5">
            <s.icon className="h-4 w-4 text-copper" />
            <div className="mt-3 font-display text-3xl text-foreground">{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
          <h2 className="font-display text-xl text-foreground">Add a catalogue material</h2>
          <p className="mt-1 text-xs text-muted-foreground">Same pipeline as student uploads.</p>
          <div className="mt-5"><DocumentUpload /></div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-xl text-foreground">Open requests</h2>
          <div className="mt-4 space-y-2">
            {openRequests.length === 0 && <p className="text-sm text-muted-foreground">Nothing open right now.</p>}
            {openRequests.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{r.title}</div>
                  {r.courses?.title && <div className="text-xs text-muted-foreground">{r.courses.title}</div>}
                </div>
                <button onClick={() => fulfilRequest(r.id)} className="shrink-0 rounded-lg bg-primary/10 p-1.5 text-copper hover:bg-primary/20">
                  <CheckCircle2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-3">
          <h2 className="font-display text-xl text-foreground">Recently processed</h2>
          <div className="mt-4 divide-y divide-border">
            {ready.slice(0, 6).map((m) => (
              <div key={m.id} className="flex items-center gap-4 py-3">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-copper"><FileText className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">{m.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{m.courses?.code ?? "General"}</div>
                </div>
              </div>
            ))}
            {ready.length === 0 && <p className="py-3 text-sm text-muted-foreground">Nothing processed yet.</p>}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Materials manager ───────────────────────────────────────────────────
// Every uploaded material — including failed ones, which used to be
// invisible to everyone. Edit metadata, reassign a course, or delete.
function MaterialsManager({ courses }: { courses: CourseWithProgramme[] }) {
  const { data: materials, isLoading } = useAdminMaterials();
  const updateMaterial = useUpdateMaterial();
  const deleteMaterial = useDeleteMaterial();
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", type: "Notes", course_code: "", content_year: "" });

  const filtered = (materials ?? []).filter((m) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return [m.title, m.courses?.code ?? "", m.status].some((h) => h.toLowerCase().includes(needle));
  });

  function startEdit(m: MaterialWithCourse) {
    setEditingId(m.id);
    setForm({
      title: m.title,
      type: m.type,
      course_code: m.course_code ?? "",
      content_year: m.content_year != null ? String(m.content_year) : "",
    });
  }

  function saveEdit(id: string) {
    const year = form.content_year.trim() ? Number(form.content_year.trim()) : null;
    updateMaterial.mutate(
      {
        id,
        title: form.title,
        type: form.type,
        course_code: form.course_code || null,
        content_year: year && Number.isFinite(year) ? year : null,
      },
      { onSuccess: () => setEditingId(null) },
    );
  }

  const statusColor: Record<string, string> = {
    ready: "text-teal",
    processing: "text-copper",
    catalog_only: "text-muted-foreground",
    failed: "text-destructive",
  };

  return (
    <div className="mt-8 rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl text-foreground">Materials ({filtered.length})</h2>
      </div>
      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title, course code, or status…"
          className="w-full rounded-xl border border-input bg-surface py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
      </div>

      {isLoading && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && filtered.length === 0 && <p className="mt-4 text-sm text-muted-foreground">Nothing matches.</p>}

      <div className="mt-4 space-y-2">
        {filtered.map((m) => (
          <div key={m.id} className="rounded-xl border border-border bg-surface p-3">
            {editingId === m.id ? (
              <div className="space-y-2">
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  placeholder="Title"
                />
                <div className="flex flex-wrap gap-2">
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                  >
                    {["Notes", "Past Paper", "Slides", "Summary", "Assignment", "Outline"].map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <select
                    value={form.course_code}
                    onChange={(e) => setForm({ ...form, course_code: e.target.value })}
                    className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="">No course</option>
                    {courses.map((c) => (<option key={c.code} value={c.code}>{c.code}</option>))}
                  </select>
                  {form.type === "Past Paper" && (
                    <input
                      value={form.content_year}
                      onChange={(e) => setForm({ ...form, content_year: e.target.value.replace(/[^0-9]/g, "").slice(0, 4) })}
                      placeholder="Year"
                      inputMode="numeric"
                      className="w-20 rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                    />
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(m.id)}
                    disabled={updateMaterial.isPending}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button onClick={() => setEditingId(null)} className="rounded-lg bg-surface-muted px-3 py-1.5 text-xs font-semibold text-foreground">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-copper"><FileText className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">{m.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {m.courses?.code ?? "No course"} · {m.type} ·{" "}
                    <span className={statusColor[m.status] ?? ""}>{m.status}</span>
                    {m.content_year ? ` · ${m.content_year}` : ""}
                    {(m.likes_count > 0 || m.download_count > 0) && ` · ${m.likes_count} ❤ · ${m.download_count} downloads`}
                  </div>
                  {/* The real reason processing failed — most commonly a missing
                      LOVABLE_API_KEY secret — instead of a dead-end "failed" with
                      no way to tell why without digging through Edge Function logs. */}
                  {m.status === "failed" && m.processing_error && (
                    <div className="mt-1 truncate rounded bg-destructive/10 px-2 py-1 font-mono text-[11px] text-destructive" title={m.processing_error}>
                      {m.processing_error}
                    </div>
                  )}
                </div>
                <button onClick={() => startEdit(m)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-foreground hover:bg-primary hover:text-primary-foreground">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete "${m.title}"? This removes the file and all its flashcards/quiz too.`)) {
                      deleteMaterial.mutate({ id: m.id, file_path: m.file_path });
                    }
                  }}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-destructive hover:bg-destructive hover:text-destructive-foreground"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Carousel manager ────────────────────────────────────────────────────
function CarouselManager() {
  const { data: slides, isLoading } = useHeroSlides();
  const addSlide = useAddHeroSlide();
  const deleteSlide = useDeleteHeroSlide();
  const reorder = useReorderHeroSlide();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const ordered = (slides ?? []).slice().sort((a, b) => a.position - b.position);

  function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    addSlide.mutate(file, { onSettled: () => setUploading(false) });
  }

  function moveUp(slide: HeroSlide, index: number) {
    if (index === 0) return;
    reorder.mutate({ a: slide, b: ordered[index - 1] });
  }
  function moveDown(slide: HeroSlide, index: number) {
    if (index === ordered.length - 1) return;
    reorder.mutate({ a: slide, b: ordered[index + 1] });
  }

  return (
    <div className="mt-8 rounded-2xl border border-border bg-card p-6">
      <h2 className="font-display text-xl text-foreground">Homepage carousel</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        These photos replace the default campus photo strip on the homepage. Add as many as you like — the site falls
        back to the built-in defaults automatically if this list is ever empty.
      </p>

      <label className="mt-5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-surface-muted p-6 text-center hover:border-primary/40">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {uploading ? (
          <span className="text-sm font-semibold text-foreground">Uploading…</span>
        ) : (
          <>
            <UploadIcon className="h-5 w-5 text-copper" />
            <span className="text-sm font-semibold text-foreground">Tap to add a photo</span>
          </>
        )}
      </label>

      {isLoading && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && ordered.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">No custom photos yet — the homepage is showing the default set.</p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {ordered.map((s, i) => (
          <div key={s.id} className="group relative overflow-hidden rounded-xl border border-border bg-surface">
            <img src={s.url} alt="" className="aspect-video w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/60 p-1.5">
              <button onClick={() => moveUp(s, i)} disabled={i === 0} className="grid h-7 w-7 place-items-center rounded-md text-white disabled:opacity-30">
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => moveDown(s, i)} disabled={i === ordered.length - 1} className="grid h-7 w-7 place-items-center rounded-md text-white disabled:opacity-30">
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => { if (confirm("Remove this photo from the carousel?")) deleteSlide.mutate(s); }}
                className="grid h-7 w-7 place-items-center rounded-md text-white hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Programmes manager ───────────────────────────────────────────────────
// Previously the only way to add or fix a programme (code, name, school,
// how many years it takes) was a one-off SQL seed — there was no way to do
// it from here at all, which also meant the Courses tab's programme
// dropdown could never grow past whatever was seeded at launch.
function ProgrammesManager({ programmes, courses }: { programmes: ProgrammeRow[]; courses: CourseWithProgramme[] }) {
  const updateProgramme = useUpdateProgramme();
  const deleteProgramme = useDeleteProgramme();
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", school: "", description: "", durationYears: 4 });

  const courseCountByProgramme = new Map<string, number>();
  for (const c of courses) {
    if (!c.programme_code) continue;
    courseCountByProgramme.set(c.programme_code, (courseCountByProgramme.get(c.programme_code) ?? 0) + 1);
  }

  function startEdit(p: ProgrammeRow) {
    setEditingCode(p.code);
    setForm({ name: p.name, school: p.school, description: p.description ?? "", durationYears: p.duration_years });
  }

  function saveEdit(code: string) {
    updateProgramme.mutate(
      { code, name: form.name, school: form.school, description: form.description, durationYears: form.durationYears },
      { onSuccess: () => setEditingCode(null) },
    );
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-3">
      <NewProgrammeCard />

      <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
        <h2 className="font-display text-xl text-foreground">Programmes ({programmes.length})</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          This is what powers the programme picker when adding or editing a course, and how long each one shows as
          taking on a student's profile.
        </p>
        <div className="mt-4 space-y-2">
          {programmes.length === 0 && <p className="text-sm text-muted-foreground">No programmes yet — add the first one.</p>}
          {programmes.map((p) => (
            <div key={p.code} className="rounded-xl border border-border bg-surface p-3 text-sm">
              {editingCode === p.code ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input value={p.code} disabled className="w-28 rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-muted-foreground" />
                    <input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Programme name"
                      className="flex-1 rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                    />
                  </div>
                  <input
                    value={form.school}
                    onChange={(e) => setForm({ ...form, school: e.target.value })}
                    placeholder="School (e.g. School of Engineering)"
                    className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                  />
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Description (optional)"
                    rows={2}
                    className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                  />
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">Duration</label>
                    <select
                      value={form.durationYears}
                      onChange={(e) => setForm({ ...form, durationYears: Number(e.target.value) })}
                      className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                    >
                      {[1, 2, 3, 4, 5, 6].map((y) => (<option key={y} value={y}>{y} year{y > 1 ? "s" : ""}</option>))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(p.code)} disabled={updateProgramme.isPending} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">
                      Save
                    </button>
                    <button onClick={() => setEditingCode(null)} className="rounded-lg bg-surface-muted px-3 py-1.5 text-xs font-semibold text-foreground">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="truncate text-foreground">{p.code} · {p.name}</span>
                    <div className="text-xs text-muted-foreground">
                      {p.school} · {p.duration_years} year{p.duration_years > 1 ? "s" : ""} · {courseCountByProgramme.get(p.code) ?? 0} course
                      {(courseCountByProgramme.get(p.code) ?? 0) === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button onClick={() => startEdit(p)} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-foreground hover:bg-primary hover:text-primary-foreground">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        const courseCount = courseCountByProgramme.get(p.code) ?? 0;
                        const warning = courseCount > 0
                          ? `Delete ${p.code}? ${courseCount} course${courseCount === 1 ? "" : "s"} linked to it will become "no programme" rather than being deleted.`
                          : `Delete ${p.code}?`;
                        if (confirm(warning)) deleteProgramme.mutate(p.code);
                      }}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-border text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NewProgrammeCard() {
  const createProgramme = useCreateProgramme();
  const [form, setForm] = useState({ code: "", name: "", school: "", description: "", durationYears: 4 });

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="font-display text-xl text-foreground">New programme</h2>
      <form
        className="mt-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          createProgramme.mutate(form, { onSuccess: () => setForm({ code: "", name: "", school: "", description: "", durationYears: 4 }) });
        }}
      >
        <input
          required
          placeholder="Code (e.g. BENG-CE)"
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          className="w-full rounded-xl border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
        <input
          required
          placeholder="Name (e.g. BEng Civil Engineering)"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full rounded-xl border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
        <input
          required
          placeholder="School (e.g. School of Engineering)"
          value={form.school}
          onChange={(e) => setForm({ ...form, school: e.target.value })}
          className="w-full rounded-xl border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
        <textarea
          placeholder="Description (optional)"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={2}
          className="w-full rounded-xl border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">How long it takes</label>
          <select
            value={form.durationYears}
            onChange={(e) => setForm({ ...form, durationYears: Number(e.target.value) })}
            className="rounded-xl border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          >
            {[1, 2, 3, 4, 5, 6].map((y) => (<option key={y} value={y}>{y} year{y > 1 ? "s" : ""}</option>))}
          </select>
        </div>
        <button type="submit" disabled={createProgramme.isPending} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          <Plus className="h-4 w-4" /> Add programme
        </button>
      </form>
    </div>
  );
}

// ── Courses manager ─────────────────────────────────────────────────────
function CoursesManager({ programmes, courses }: { programmes: { code: string; name: string }[]; courses: CourseWithProgramme[] }) {
  const updateCourse = useUpdateCourse();
  const deleteCourse = useDeleteCourse();
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "", lecturer: "", description: "", topics: "", programmeCode: "", year: 1, semester: 1 as 1 | 2,
  });

  function startEdit(c: CourseWithProgramme) {
    setEditingCode(c.code);
    setForm({
      title: c.title,
      lecturer: c.lecturer ?? "",
      description: c.description,
      topics: c.topics.join(", "),
      programmeCode: c.programme_code ?? "",
      year: c.year,
      semester: c.semester as 1 | 2,
    });
  }

  function saveEdit(code: string) {
    updateCourse.mutate(
      {
        code,
        title: form.title,
        lecturer: form.lecturer || null,
        description: form.description,
        topics: form.topics.split(",").map((t) => t.trim()).filter(Boolean),
        programmeCode: form.programmeCode,
        year: form.year,
        semester: form.semester,
      },
      { onSuccess: () => setEditingCode(null) },
    );
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-3">
      <NewCourseCard programmes={programmes} />

      <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
        <h2 className="font-display text-xl text-foreground">Courses ({courses.length})</h2>
        <div className="mt-4 space-y-2">
          {courses.map((c) => (
            <div key={c.code} className="rounded-xl border border-border bg-surface p-3 text-sm">
              {editingCode === c.code ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input value={c.code} disabled className="w-28 rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-muted-foreground" />
                    <input
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="Title"
                      className="flex-1 rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                    />
                  </div>
                  <input
                    value={form.lecturer}
                    onChange={(e) => setForm({ ...form, lecturer: e.target.value })}
                    placeholder="Lecturer"
                    className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                  />
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Description"
                    rows={2}
                    className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                  />
                  <input
                    value={form.topics}
                    onChange={(e) => setForm({ ...form, topics: e.target.value })}
                    placeholder="Topics, comma separated"
                    className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                  />
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={form.programmeCode}
                      onChange={(e) => setForm({ ...form, programmeCode: e.target.value })}
                      className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                    >
                      {programmes.map((p) => (<option key={p.code} value={p.code}>{p.code}</option>))}
                    </select>
                    <select
                      value={form.year}
                      onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}
                      className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                    >
                      {[1, 2, 3, 4, 5].map((y) => (<option key={y} value={y}>Year {y}</option>))}
                    </select>
                    <select
                      value={form.semester}
                      onChange={(e) => setForm({ ...form, semester: Number(e.target.value) as 1 | 2 })}
                      className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                    >
                      <option value={1}>Sem 1</option><option value={2}>Sem 2</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(c.code)} disabled={updateCourse.isPending} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">
                      Save
                    </button>
                    <button onClick={() => setEditingCode(null)} className="rounded-lg bg-surface-muted px-3 py-1.5 text-xs font-semibold text-foreground">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="truncate text-foreground">{c.code} · {c.title}</span>
                    <div className="text-xs text-muted-foreground">Y{c.year}S{c.semester} · {c.lecturer || "No lecturer set"}</div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button onClick={() => startEdit(c)} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-foreground hover:bg-primary hover:text-primary-foreground">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => { if (confirm(`Delete ${c.code}? Materials linked to it will lose their course tag.`)) deleteCourse.mutate(c.code); }}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-border text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Student directory ────────────────────────────────────────────────────
function StudentsManager({ currentUserId }: { currentUserId: string }) {
  const { data: students, isLoading } = useAllStudents();
  const { data: userRoles } = useAllUserRoles();
  const promote = usePromoteToAdmin();
  const demote = useDemoteFromAdmin();
  const [search, setSearch] = useState("");

  const adminIds = new Set((userRoles ?? []).filter((r) => r.role === "admin").map((r) => r.user_id));

  const filtered = (students ?? []).filter((s) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return [s.full_name, s.student_number ?? "", s.programme_code].some((h) => h.toLowerCase().includes(needle));
  });

  return (
    <div className="mt-8 rounded-2xl border border-border bg-card p-6">
      <h2 className="font-display text-xl text-foreground">Students ({filtered.length})</h2>
      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, student number, or programme…"
          className="w-full rounded-xl border border-input bg-surface py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
      </div>

      {isLoading && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && filtered.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No students match.</p>}

      <div className="mt-4 space-y-2">
        {filtered.map((s) => {
          const isAdminRow = adminIds.has(s.id);
          const isSelf = s.id === currentUserId;
          return (
            <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 truncate text-sm font-semibold text-foreground">
                  {s.full_name || "Unnamed"}
                  {isAdminRow && <Crown className="h-3.5 w-3.5 shrink-0 text-copper" />}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {s.student_number ?? "No student number"} · {s.programme_code || "No programme"} · Year {s.year}
                </div>
              </div>
              {isAdminRow ? (
                <button
                  onClick={() => { if (confirm(`Remove admin access from ${s.full_name || "this account"}?`)) demote.mutate(s.id); }}
                  disabled={isSelf || demote.isPending}
                  title={isSelf ? "You can't remove your own admin access" : undefined}
                  className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Demote
                </button>
              ) : (
                <button
                  onClick={() => { if (confirm(`Make ${s.full_name || "this account"} an admin?`)) promote.mutate(s.id); }}
                  disabled={promote.isPending}
                  className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-copper disabled:opacity-50"
                >
                  Promote
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Auth gates (unchanged) ───────────────────────────────────────────────
function AdminAuthGate({
  signIn,
  signUp,
}: {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (fields: {
    email: string; password: string; fullName: string; studentNumber: string; school: string; programmeCode: string; year: number;
  }) => Promise<{ error: string | null }>;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signin") {
        const { error: err } = await signIn(email, password);
        if (err) throw new Error(err);
      } else {
        const { error: err } = await signUp({
          email, password, fullName: fullName || "Admin",
          studentNumber: `ADM-${Date.now().toString().slice(-6)}`,
          school: "Administration", programmeCode: "ADMIN", year: 1,
        });
        if (err) throw new Error(err);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-copper shadow-[0_0_28px_oklch(0.7_0.16_48_/_0.35)]">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="mt-6 font-display text-3xl text-foreground">Admin access</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "signin" ? "Sign in with your admin credentials." : "Create the admin account for this Learnova install."}
        </p>

        {error && (
          <div className="mt-5 w-full rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-left text-xs text-foreground">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="mt-6 w-full space-y-3 text-left">
          {mode === "signup" && (
            <Field label="Name" value={fullName} onChange={setFullName} placeholder="Your name" />
          )}
          <Field label="Email" value={email} onChange={setEmail} type="email" placeholder="you@example.com" required />
          <Field label="Password" value={password} onChange={setPassword} type="password" placeholder="At least 8 characters" required minLength={8} />
          <button
            type="submit"
            disabled={busy}
            className="mt-2 inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft hover:opacity-95 disabled:opacity-60"
          >
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create admin account"}
          </button>
        </form>

        <button
          onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}
          className="mt-6 text-xs font-semibold text-copper hover:underline"
        >
          {mode === "signin" ? "First time here? Create the admin account →" : "Have an account? Sign in →"}
        </button>
      </div>
    </div>
  );
}

function AdminClaimGate({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function claimAdmin() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { data, error: claimError } = await supabase.rpc("claim_initial_admin");
      if (claimError) throw claimError;
      if (!data) throw new Error("An admin account already exists. Sign in with that admin account to manage Learnova.");
      setMessage("Admin access created. Refreshing…");
      window.setTimeout(() => window.location.reload(), 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Admin setup failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-lg px-6 py-20">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-copper shadow-[0_0_28px_oklch(0.7_0.16_48_/_0.35)]">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="mt-6 font-display text-3xl text-foreground">You're one step away.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You're signed in, but this account doesn't have admin access yet. If this is the first admin setup, claim it here.
        </p>

        <div className="mt-6 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-copper" />
            One-time bootstrap. Once an admin exists, this button locks itself and only admin accounts can manage the control room.
          </div>
          {error && <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-foreground">{error}</div>}
          {message && <div className="mt-3 rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs text-foreground">{message}</div>}
          <button
            onClick={claimAdmin}
            disabled={busy || !userId}
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft disabled:opacity-60"
          >
            <KeyRound className="h-4 w-4" /> {busy ? "Claiming access…" : "Claim first admin access"}
          </button>
        </div>

        <button
          onClick={() => window.location.reload()}
          className="mt-6 text-xs font-semibold text-copper hover:underline"
        >
          Refresh status →
        </button>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-foreground">{label}</span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-input bg-surface px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
      />
    </label>
  );
}

function NewCourseCard({ programmes }: { programmes: { code: string; name: string }[] }) {
  const createCourse = useCreateCourse();
  const [form, setForm] = useState({ code: "", title: "", programmeCode: programmes[0]?.code ?? "", year: 1, semester: 1 as 1 | 2, lecturer: "" });

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
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
        <input placeholder="Lecturer (optional)" value={form.lecturer} onChange={(e) => setForm({ ...form, lecturer: e.target.value })} className="w-full rounded-xl border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
        <button type="submit" disabled={createCourse.isPending} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          <Plus className="h-4 w-4" /> Add course
        </button>
      </form>
    </div>
  );
    }
