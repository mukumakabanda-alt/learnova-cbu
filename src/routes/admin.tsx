import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader, SiteFooter, MobileTabBar } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/use-auth";
import {
  useCatalog, useOpenRequests, useUpdateMaterialRequest, useProgrammes, useCreateProgramme, useUpdateProgramme, useDeleteProgramme,
  useCourses, useCreateCourse, useUpdateCourse, useDeleteCourse, useAdminMaterials, useUpdateMaterial, useDeleteMaterial,
  useHeroSlides, useAddHeroSlide, useDeleteHeroSlide, useReorderHeroSlide,
  useAllStudents, useAllUserRoles, usePromoteToAdmin, useDemoteFromAdmin,
  useAdminAnalytics, useSiteSettings, useUpdateSiteSettings,
  type CourseWithProgramme, type MaterialWithCourse, type HeroSlide,
} from "@/lib/queries";
import type { Database } from "@/integrations/supabase/types";
import { DocumentUpload } from "@/components/DocumentUpload";
import { useRef, useState } from "react";
import {
  Users, GraduationCap, FileText, Inbox, Plus, CheckCircle2, ShieldCheck, KeyRound, Info,
  Pencil, Trash2, ArrowUp, ArrowDown, Search, Crown, LayoutDashboard, BookOpen, BarChart3,
  SlidersHorizontal, AlertTriangle, Star, X, UploadCloud, XCircle, Archive,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin — Learnova" }, { name: "robots", content: "noindex" }],
  }),
  component: Admin,
});

// Seven sections instead of six flat tabs — Programmes now lives inside
// Courses (they were always edited side by side anyway) and the hero
// carousel now lives inside Settings (it's homepage branding, same as
// the new homepage text). Requests and Analytics are new: requests used
// to be a small widget on Overview with one action, and there was no
// analytics view at all beyond a couple of counts.
type Tab = "overview" | "materials" | "courses" | "requests" | "users" | "analytics" | "settings";
type ProgrammeRow = Database["public"]["Tables"]["programmes"]["Row"];
type RequestStatus = Database["public"]["Enums"]["request_status"];

const NAV: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "materials", label: "Materials", icon: FileText },
  { id: "courses", label: "Courses", icon: GraduationCap },
  { id: "requests", label: "Requests", icon: Inbox },
  { id: "users", label: "Users", icon: Users },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: SlidersHorizontal },
];

function Admin() {
  const { user, profile, isAdmin, loading, signIn, signUp } = useAuth();

  if (loading) return <div className="min-h-screen bg-background" />;

  // Not signed in → inline auth on the admin page itself. No redirect.
  if (!user || !profile) {
    return <AdminAuthGate signIn={signIn} signUp={signUp} />;
  }

  // Signed in but not admin → claim panel with self-service instructions.
  if (!isAdmin) {
    return <AdminClaimGate userId={user.id} />;
  }

  return <AdminShell userId={user.id} />;
}

// ── Shell: sidebar + work queue + whichever section is active ──────────
// This is the "command center" layer. Quick actions and the needs-
// attention queue live in the sidebar so they're visible no matter which
// section you're looking at — you shouldn't have to go hunting for what
// needs fixing.
function AdminShell({ userId }: { userId: string }) {
  const [tab, setTab] = useState<Tab>("overview");
  const { data: materials } = useAdminMaterials();
  const { data: requests } = useOpenRequests();
  const { data: programmes } = useProgrammes();
  const { data: courses } = useCourses();
  const { data: students } = useAllStudents();

  const failedMaterials = (materials ?? []).filter((m) => m.status === "failed");
  const pendingRequests = (requests ?? []).filter((r) => r.status === "open");

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface-muted/40 p-5 lg:flex">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-copper">Admin</div>
          <h1 className="mt-1 font-display text-2xl leading-tight text-foreground">Control room</h1>
        </div>

        <div className="mt-8 space-y-1.5">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Quick actions</p>
          <button
            onClick={() => setTab("materials")}
            className="flex w-full items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-95"
          >
            <UploadCloud className="h-4 w-4" /> Upload material
          </button>
          <button
            onClick={() => setTab("courses")}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-muted"
          >
            <Plus className="h-4 w-4" /> Add course
          </button>
          <button
            onClick={() => setTab("requests")}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-muted"
          >
            <CheckCircle2 className="h-4 w-4" /> Resolve a request
          </button>
        </div>

        {(failedMaterials.length > 0 || pendingRequests.length > 0) && (
          <div className="mt-6 space-y-1.5">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Needs attention</p>
            {failedMaterials.length > 0 && (
              <button
                onClick={() => setTab("materials")}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm text-foreground hover:bg-surface-muted"
              >
                <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /> Failed uploads</span>
                <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">{failedMaterials.length}</span>
              </button>
            )}
            {pendingRequests.length > 0 && (
              <button
                onClick={() => setTab("requests")}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm text-foreground hover:bg-surface-muted"
              >
                <span className="flex items-center gap-2"><Inbox className="h-4 w-4 text-copper" /> Open requests</span>
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-copper">{pendingRequests.length}</span>
              </button>
            )}
          </div>
        )}

        <div className="mt-6 flex-1 space-y-1">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Manage</p>
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => setTab(n.id)}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                tab === n.id ? "bg-primary/10 text-copper" : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"
              }`}
            >
              <n.icon className="h-4 w-4" /> {n.label}
            </button>
          ))}
        </div>
      </aside>

      {/* Same seven sections as a scrollable tab strip below lg — the
          sidebar's fixed width doesn't have room to earn its keep on a
          phone screen, so mobile gets the flat strip the desktop used
          to have. */}
      <div className="flex-1">
        <div className="border-b border-border bg-surface-muted/40 px-4 py-3 lg:hidden">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-copper">Admin</div>
          <div className="mt-2 flex gap-1.5 overflow-x-auto">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  tab === n.id ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground"
                }`}
              >
                {n.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
          {tab === "overview" && (
            <OverviewPanel
              materials={materials ?? []}
              programmes={programmes ?? []}
              courses={courses ?? []}
              requests={requests ?? []}
              studentCount={(students ?? []).length}
              goTo={setTab}
            />
          )}
          {tab === "materials" && <MaterialsPanel courses={courses ?? []} />}
          {tab === "courses" && <CoursesPanel programmes={programmes ?? []} courses={courses ?? []} />}
          {tab === "requests" && <RequestsPanel />}
          {tab === "users" && <UsersPanel currentUserId={userId} />}
          {tab === "analytics" && <AnalyticsPanel goToMaterials={() => setTab("materials")} />}
          {tab === "settings" && <SettingsPanel courses={courses ?? []} />}
        </div>
      </div>
    </div>
  );
}

// ── Overview ────────────────────────────────────────────────────────────
function OverviewPanel({
  materials, programmes, courses, requests, studentCount, goTo,
}: {
  materials: MaterialWithCourse[];
  programmes: { code: string; name: string }[];
  courses: CourseWithProgramme[];
  requests: { id: string; status: string }[];
  studentCount: number;
  goTo: (tab: Tab) => void;
}) {
  const ready = materials.filter((m) => m.status === "ready");
  const failed = materials.filter((m) => m.status === "failed");
  const openRequests = requests.filter((r) => r.status === "open");

  return (
    <>
      <h2 className="font-display text-3xl text-foreground">Overview</h2>
      <p className="mt-1 text-sm text-muted-foreground">What's happening across Learnova right now.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: FileText, label: "Materials ready", value: ready.length },
          { icon: Users, label: "Students", value: studentCount },
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

      {(failed.length > 0 || openRequests.length > 0) && (
        <div className="mt-6 rounded-2xl border border-destructive/25 bg-destructive/5 p-5">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <AlertTriangle className="h-4 w-4 text-destructive" /> Needs your attention
          </p>
          <div className="mt-3 space-y-2 text-sm">
            {failed.length > 0 && (
              <button onClick={() => goTo("materials")} className="flex w-full items-center justify-between rounded-xl border border-border bg-surface p-3 text-left hover:border-destructive/40">
                <span className="text-foreground">{failed.length} upload{failed.length === 1 ? "" : "s"} failed processing</span>
                <span className="text-xs font-semibold text-copper">Fix →</span>
              </button>
            )}
            {openRequests.length > 0 && (
              <button onClick={() => goTo("requests")} className="flex w-full items-center justify-between rounded-xl border border-border bg-surface p-3 text-left hover:border-primary/40">
                <span className="text-foreground">{openRequests.length} open request{openRequests.length === 1 ? "" : "s"} from students</span>
                <span className="text-xs font-semibold text-copper">Review →</span>
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-border bg-card p-6">
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
    </>
  );
}

// ── Materials manager ───────────────────────────────────────────────────
function MaterialsPanel({ courses }: { courses: CourseWithProgramme[] }) {
  const { data: materials, isLoading } = useAdminMaterials();
  const updateMaterial = useUpdateMaterial();
  const deleteMaterial = useDeleteMaterial();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "ready" | "processing" | "catalog_only" | "failed">("all");
  const [showUpload, setShowUpload] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", type: "Notes", course_code: "", content_year: "", tags: "" });

  const filtered = (materials ?? []).filter((m) => {
    if (statusFilter !== "all" && m.status !== statusFilter) return false;
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
      tags: (m.tags ?? []).join(", "),
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
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
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
  const STATUS_TABS: { id: typeof statusFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "ready", label: "Ready" },
    { id: "processing", label: "Processing" },
    { id: "catalog_only", label: "Catalog only" },
    { id: "failed", label: "Failed" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl text-foreground">Materials</h2>
          <p className="mt-1 text-sm text-muted-foreground">Every file in the library, including the ones that need fixing.</p>
        </div>
        <button
          onClick={() => setShowUpload((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-95"
        >
          <UploadCloud className="h-4 w-4" /> {showUpload ? "Hide upload" : "Upload material"}
        </button>
      </div>

      {showUpload && (
        <div className="mt-5 rounded-2xl border border-border bg-card p-6">
          <h3 className="font-display text-lg text-foreground">Add a catalogue material</h3>
          <p className="mt-1 text-xs text-muted-foreground">Same pipeline as student uploads.</p>
          <div className="mt-4"><DocumentUpload /></div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-1.5">
        {STATUS_TABS.map((s) => (
          <button
            key={s.id}
            onClick={() => setStatusFilter(s.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              statusFilter === s.id ? "bg-primary text-primary-foreground" : "bg-surface-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {s.label}
          </button>
        ))}
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

      <div className="mt-4 rounded-2xl border border-border bg-card p-6">
        <p className="text-xs text-muted-foreground">{filtered.length} material{filtered.length === 1 ? "" : "s"}</p>
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
                    {(m.status === "ready" || m.status === "catalog_only" || m.status === "failed") && (
                      <select
                        value={m.status}
                        onChange={(e) => updateMaterial.mutate({ id: m.id, status: e.target.value as "ready" | "catalog_only" | "failed" })}
                        className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                      >
                        <option value="ready">Ready</option>
                        <option value="catalog_only">Catalog only</option>
                        <option value="failed">Failed</option>
                      </select>
                    )}
                  </div>
                  <input
                    value={form.tags}
                    onChange={(e) => setForm({ ...form, tags: e.target.value })}
                    placeholder="Tags, comma separated"
                    className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                  />
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
                      <span className={statusColor[m.status] ?? ""}>{m.status.replace("_", " ")}</span>
                      {m.content_year ? ` · ${m.content_year}` : ""}
                      {(m.likes_count > 0 || m.download_count > 0) && ` · ${m.likes_count} ❤ · ${m.download_count} downloads`}
                      {m.tags && m.tags.length > 0 && ` · ${m.tags.join(", ")}`}
                    </div>
                    {m.status === "failed" && m.processing_error && (
                      <div className="mt-1 flex items-start gap-1 text-xs text-destructive">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {m.processing_error}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button onClick={() => startEdit(m)} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-foreground hover:bg-primary hover:text-primary-foreground">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => { if (confirm(`Delete "${m.title}"? This can't be undone.`)) deleteMaterial.mutate({ id: m.id, file_path: m.file_path }); }}
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

// ── Courses & Programmes ────────────────────────────────────────────────
// Kept as one section — a course is meaningless without a programme to
// hang off, and they were always edited side by side. Splitting them
// into separate top-level tabs would just mean flipping back and forth.
function CoursesPanel({ programmes, courses }: { programmes: ProgrammeRow[]; courses: CourseWithProgramme[] }) {
  const updateCourse = useUpdateCourse();
  const deleteCourse = useDeleteCourse();
  const updateProgramme = useUpdateProgramme();
  const deleteProgramme = useDeleteProgramme();
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [courseForm, setCourseForm] = useState({
    title: "", lecturer: "", description: "", topics: "", programmeCode: "", year: 1,
  });
  const [editingProgCode, setEditingProgCode] = useState<string | null>(null);
  const [progForm, setProgForm] = useState({ name: "", school: "", description: "", durationYears: 4 });

  const courseCountByProgramme = new Map<string, number>();
  for (const c of courses) {
    if (!c.programme_code) continue;
    courseCountByProgramme.set(c.programme_code, (courseCountByProgramme.get(c.programme_code) ?? 0) + 1);
  }

  function startEditCourse(c: CourseWithProgramme) {
    setEditingCode(c.code);
    setCourseForm({
      title: c.title, lecturer: c.lecturer ?? "", description: c.description,
      topics: c.topics.join(", "), programmeCode: c.programme_code ?? "", year: c.year,
    });
  }

  function saveEditCourse(code: string) {
    updateCourse.mutate(
      {
        code, title: courseForm.title, lecturer: courseForm.lecturer || null, description: courseForm.description,
        topics: courseForm.topics.split(",").map((t) => t.trim()).filter(Boolean),
        programmeCode: courseForm.programmeCode, year: courseForm.year,
      },
      { onSuccess: () => setEditingCode(null) },
    );
  }

  function startEditProgramme(p: ProgrammeRow) {
    setEditingProgCode(p.code);
    setProgForm({ name: p.name, school: p.school, description: p.description ?? "", durationYears: p.duration_years });
  }

  function saveEditProgramme(code: string) {
    updateProgramme.mutate(
      { code, name: progForm.name, school: progForm.school, description: progForm.description, durationYears: progForm.durationYears },
      { onSuccess: () => setEditingProgCode(null) },
    );
  }

  return (
    <div>
      <h2 className="font-display text-3xl text-foreground">Courses</h2>
      <p className="mt-1 text-sm text-muted-foreground">The structure everything else — materials, requests, the catalogue — hangs off.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <NewCourseCard programmes={programmes} />
        <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
          <h3 className="font-display text-xl text-foreground">All courses ({courses.length})</h3>
          <div className="mt-4 space-y-2">
            {courses.map((c) => (
              <div key={c.code} className="rounded-xl border border-border bg-surface p-3 text-sm">
                {editingCode === c.code ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input value={c.code} disabled className="w-28 rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-muted-foreground" />
                      <input
                        value={courseForm.title}
                        onChange={(e) => setCourseForm({ ...courseForm, title: e.target.value })}
                        placeholder="Title"
                        className="flex-1 rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                      />
                    </div>
                    <input
                      value={courseForm.lecturer}
                      onChange={(e) => setCourseForm({ ...courseForm, lecturer: e.target.value })}
                      placeholder="Lecturer"
                      className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                    />
                    <textarea
                      value={courseForm.description}
                      onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })}
                      placeholder="Description"
                      rows={2}
                      className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                    />
                    <input
                      value={courseForm.topics}
                      onChange={(e) => setCourseForm({ ...courseForm, topics: e.target.value })}
                      placeholder="Topics, comma separated"
                      className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                    />
                    <div className="flex flex-wrap gap-2">
                      <select
                        value={courseForm.programmeCode}
                        onChange={(e) => setCourseForm({ ...courseForm, programmeCode: e.target.value })}
                        className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                      >
                        {programmes.map((p) => (<option key={p.code} value={p.code}>{p.code}</option>))}
                      </select>
                      <select
                        value={courseForm.year}
                        onChange={(e) => setCourseForm({ ...courseForm, year: Number(e.target.value) })}
                        className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                      >
                        {[1, 2, 3, 4, 5].map((y) => (<option key={y} value={y}>Year {y}</option>))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => saveEditCourse(c.code)} disabled={updateCourse.isPending} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">
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
                      <div className="text-xs text-muted-foreground">Year {c.year} · {c.lecturer || "No lecturer set"}</div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button onClick={() => startEditCourse(c)} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-foreground hover:bg-primary hover:text-primary-foreground">
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

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <NewProgrammeCard />
        <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
          <h3 className="font-display text-xl text-foreground">Programmes ({programmes.length})</h3>
          <p className="mt-1 text-xs text-muted-foreground">Powers the programme picker above, and how long each one shows as taking on a student's profile.</p>
          <div className="mt-4 space-y-2">
            {programmes.length === 0 && <p className="text-sm text-muted-foreground">No programmes yet — add the first one.</p>}
            {programmes.map((p) => (
              <div key={p.code} className="rounded-xl border border-border bg-surface p-3 text-sm">
                {editingProgCode === p.code ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input value={p.code} disabled className="w-28 rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-muted-foreground" />
                      <input
                        value={progForm.name}
                        onChange={(e) => setProgForm({ ...progForm, name: e.target.value })}
                        placeholder="Programme name"
                        className="flex-1 rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                      />
                    </div>
                    <input
                      value={progForm.school}
                      onChange={(e) => setProgForm({ ...progForm, school: e.target.value })}
                      placeholder="School (e.g. School of Engineering)"
                      className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                    />
                    <textarea
                      value={progForm.description}
                      onChange={(e) => setProgForm({ ...progForm, description: e.target.value })}
                      placeholder="Description (optional)"
                      rows={2}
                      className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                    />
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-muted-foreground">Duration</label>
                      <select
                        value={progForm.durationYears}
                        onChange={(e) => setProgForm({ ...progForm, durationYears: Number(e.target.value) })}
                        className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                      >
                        {[1, 2, 3, 4, 5, 6].map((y) => (<option key={y} value={y}>{y} year{y > 1 ? "s" : ""}</option>))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => saveEditProgramme(p.code)} disabled={updateProgramme.isPending} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">
                        Save
                      </button>
                      <button onClick={() => setEditingProgCode(null)} className="rounded-lg bg-surface-muted px-3 py-1.5 text-xs font-semibold text-foreground">
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
                      <button onClick={() => startEditProgramme(p)} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-foreground hover:bg-primary hover:text-primary-foreground">
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
    </div>
  );
}

function NewCourseCard({ programmes }: { programmes: ProgrammeRow[] }) {
  const createCourse = useCreateCourse();
  const [form, setForm] = useState({ code: "", title: "", programmeCode: programmes[0]?.code ?? "", year: 1, lecturer: "" });

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h3 className="font-display text-xl text-foreground">New course</h3>
      <form
        className="mt-3 space-y-2"
        onSubmit={(e) => { e.preventDefault(); createCourse.mutate(form, { onSuccess: () => setForm({ ...form, code: "", title: "", lecturer: "" }) }); }}
      >
        <input required placeholder="Code (e.g. CS 220)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-full rounded-xl border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
        <input required placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-xl border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
        <select value={form.programmeCode} onChange={(e) => setForm({ ...form, programmeCode: e.target.value })} className="w-full rounded-xl border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none">
          {programmes.map((p) => (<option key={p.code} value={p.code}>{p.name}</option>))}
        </select>
        <select value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} className="w-full rounded-xl border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none">
          {[1, 2, 3, 4, 5].map((y) => (<option key={y} value={y}>Year {y}</option>))}
        </select>
        <input placeholder="Lecturer (optional)" value={form.lecturer} onChange={(e) => setForm({ ...form, lecturer: e.target.value })} className="w-full rounded-xl border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
        <button type="submit" disabled={createCourse.isPending} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          <Plus className="h-4 w-4" /> Add course
        </button>
      </form>
    </div>
  );
}

function NewProgrammeCard() {
  const createProgramme = useCreateProgramme();
  const [form, setForm] = useState({ code: "", name: "", school: "", description: "", durationYears: 4 });

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h3 className="font-display text-xl text-foreground">New programme</h3>
      <form
        className="mt-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          createProgramme.mutate(form, { onSuccess: () => setForm({ code: "", name: "", school: "", description: "", durationYears: 4 }) });
        }}
      >
        <input required placeholder="Code (e.g. BENG-CE)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-full rounded-xl border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
        <input required placeholder="Name (e.g. BEng Civil Engineering)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-xl border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
        <input required placeholder="School (e.g. School of Engineering)" value={form.school} onChange={(e) => setForm({ ...form, school: e.target.value })} className="w-full rounded-xl border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
        <textarea placeholder="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="w-full rounded-xl border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">How long it takes</label>
          <select value={form.durationYears} onChange={(e) => setForm({ ...form, durationYears: Number(e.target.value) })} className="rounded-xl border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none">
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

// ── Requests ─────────────────────────────────────────────────────────
// New dedicated section — previously this was a small widget on Overview
// with a single "mark fulfilled" action and no way to see anything that
// wasn't currently open.
function RequestsPanel() {
  const { data: requests, isLoading } = useOpenRequests();
  const updateRequest = useUpdateMaterialRequest();
  const [statusFilter, setStatusFilter] = useState<RequestStatus | "all">("open");
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});

  const filtered = (requests ?? []).filter((r) => statusFilter === "all" || r.status === statusFilter);

  function saveNote(id: string) {
    updateRequest.mutate({ id, notes: noteDraft[id] ?? "" });
  }

  return (
    <div>
      <h2 className="font-display text-3xl text-foreground">Requests</h2>
      <p className="mt-1 text-sm text-muted-foreground">What students are asking for that isn't in the library yet.</p>

      <div className="mt-5 flex flex-wrap gap-1.5">
        {(["open", "fulfilled", "closed", "all"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
              statusFilter === s ? "bg-primary text-primary-foreground" : "bg-surface-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-card p-6">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && filtered.length === 0 && <p className="text-sm text-muted-foreground">Nothing here.</p>}

        <div className="space-y-2">
          {filtered.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">{r.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.courses?.title && `${r.courses.title} · `}
                    <span className="capitalize">{r.status}</span>
                  </div>
                  {r.notes && <p className="mt-1 text-xs italic text-muted-foreground">Note: {r.notes}</p>}
                </div>
                {r.status === "open" && (
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      onClick={() => updateRequest.mutate({ id: r.id, status: "fulfilled" })}
                      title="Mark fulfilled — upload the material in the Materials tab first if needed"
                      className="grid h-8 w-8 place-items-center rounded-lg border border-border text-teal hover:bg-primary/10"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => updateRequest.mutate({ id: r.id, status: "closed" })}
                      title="Close without fulfilling"
                      className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-surface-muted"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
              {r.status === "open" && (
                <div className="mt-2 flex gap-2">
                  <input
                    value={noteDraft[r.id] ?? r.notes ?? ""}
                    onChange={(e) => setNoteDraft({ ...noteDraft, [r.id]: e.target.value })}
                    placeholder="Leave yourself a note — keeps it open, just flagged"
                    className="flex-1 rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                  />
                  <button onClick={() => saveNote(r.id)} className="rounded-lg bg-surface-muted px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-primary hover:text-primary-foreground">
                    Save note
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Users ────────────────────────────────────────────────────────────
function UsersPanel({ currentUserId }: { currentUserId: string }) {
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
    <div>
      <h2 className="font-display text-3xl text-foreground">Users</h2>
      <p className="mt-1 text-sm text-muted-foreground">Everyone with a Learnova account, and who has admin access.</p>

      <div className="relative mt-5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, student number, or programme…"
          className="w-full rounded-xl border border-input bg-surface py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-card p-6">
        <p className="text-xs text-muted-foreground">{filtered.length} user{filtered.length === 1 ? "" : "s"}</p>
        {isLoading && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && filtered.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No one matches.</p>}

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
                    className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-destructive hover:text-destructive-foreground disabled:opacity-40"
                  >
                    Remove admin
                  </button>
                ) : (
                  <button
                    onClick={() => { if (confirm(`Give ${s.full_name || "this account"} admin access?`)) promote.mutate(s.id); }}
                    disabled={promote.isPending}
                    className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-primary hover:text-primary-foreground"
                  >
                    Make admin
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Analytics ────────────────────────────────────────────────────────
// Everything shown here comes from real columns — downloads, likes,
// processing errors, and whether flashcards/quizzes exist for a
// material. Quiz completion and flashcard usage by students aren't
// tracked anywhere in the schema yet, so rather than fake those numbers,
// this reports generation coverage instead — how much of the ready
// catalogue actually has study tools attached.
function AnalyticsPanel({ goToMaterials }: { goToMaterials: () => void }) {
  const { data, isLoading } = useAdminAnalytics();

  if (isLoading || !data) {
    return (
      <div>
        <h2 className="font-display text-3xl text-foreground">Analytics</h2>
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-display text-3xl text-foreground">Analytics</h2>
      <p className="mt-1 text-sm text-muted-foreground">What students actually use — so you know what to fix or add next.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="font-display text-3xl text-foreground">{data.withFlashcardsCount}<span className="text-base text-muted-foreground"> / {data.visibleCount}</span></div>
          <div className="text-xs text-muted-foreground">Materials with flashcards generated</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="font-display text-3xl text-foreground">{data.withQuizCount}<span className="text-base text-muted-foreground"> / {data.visibleCount}</span></div>
          <div className="text-xs text-muted-foreground">Materials with a quiz generated</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="font-display text-3xl text-foreground">{data.noEngagementCount}</div>
          <div className="text-xs text-muted-foreground">Materials with zero downloads or likes</div>
        </div>
      </div>

      {data.failed.length > 0 && (
        <div className="mt-6 rounded-2xl border border-destructive/25 bg-destructive/5 p-6">
          <button onClick={goToMaterials} className="flex items-center gap-1.5 font-display text-xl text-foreground hover:underline">
            <AlertTriangle className="h-4 w-4 text-destructive" /> Failed uploads ({data.failed.length})
          </button>
          <div className="mt-3 space-y-2">
            {data.failed.slice(0, 6).map((m) => (
              <div key={m.id} className="rounded-xl border border-border bg-surface p-3 text-sm">
                <div className="truncate font-medium text-foreground">{m.title}</div>
                <div className="truncate text-xs text-muted-foreground">{m.courses?.code ?? "No course"}</div>
                {m.processing_error && <div className="mt-1 text-xs text-destructive">{m.processing_error}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="font-display text-lg text-foreground">Most downloaded</h3>
          <div className="mt-3 space-y-2">
            {data.topDownloads.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-foreground">{m.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{m.download_count}</span>
              </div>
            ))}
            {data.topDownloads.length === 0 && <p className="text-sm text-muted-foreground">No downloads yet.</p>}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="font-display text-lg text-foreground">Most liked</h3>
          <div className="mt-3 space-y-2">
            {data.topLikes.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-foreground">{m.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{m.likes_count} ❤</span>
              </div>
            ))}
            {data.topLikes.length === 0 && <p className="text-sm text-muted-foreground">No likes yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Settings ─────────────────────────────────────────────────────────
// Homepage text and featured courses are new (backed by the new
// site_settings table). The hero carousel already existed as its own
// tab — it's homepage branding too, so it lives here now rather than
// getting its own top-level section.
function SettingsPanel({ courses }: { courses: CourseWithProgramme[] }) {
  const { data: settings, isLoading } = useSiteSettings();
  const updateSettings = useUpdateSiteSettings();
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [featured, setFeatured] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  if (settings && !loaded) {
    setTitle(settings.homepage_title);
    setSubtitle(settings.homepage_subtitle);
    setFeatured(settings.featured_course_codes);
    setLoaded(true);
  }

  function toggleFeatured(code: string) {
    setFeatured((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  function save() {
    updateSettings.mutate({ homepage_title: title, homepage_subtitle: subtitle, featured_course_codes: featured });
  }

  return (
    <div>
      <h2 className="font-display text-3xl text-foreground">Settings</h2>
      <p className="mt-1 text-sm text-muted-foreground">Branding, homepage content, and what gets featured.</p>

      {isLoading && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}

      {settings && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-6">
          <h3 className="font-display text-lg text-foreground">Homepage</h3>
          <div className="mt-3 space-y-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Homepage title"
              className="w-full rounded-xl border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            />
            <textarea
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="Homepage subtitle"
              rows={2}
              className="w-full rounded-xl border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            />
          </div>

          <div className="mt-5">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><Star className="h-3.5 w-3.5 text-gold" /> Featured courses</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {courses.map((c) => (
                <button
                  key={c.code}
                  onClick={() => toggleFeatured(c.code)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                    featured.includes(c.code) ? "border-primary bg-primary/10 text-copper" : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {c.code}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={save}
            disabled={updateSettings.isPending}
            className="mt-5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {updateSettings.isPending ? "Saving…" : "Save settings"}
          </button>
        </div>
      )}

      <div className="mt-6">
        <h3 className="font-display text-lg text-foreground">Homepage photos</h3>
        <p className="mt-1 text-xs text-muted-foreground">The carousel on the homepage — falls back to the default set if empty.</p>
        <div className="mt-3">
          <CarouselManager />
        </div>
      </div>
    </div>
  );
}

// ── Homepage carousel ────────────────────────────────────────────────
function CarouselManager() {
  const { data: slides, isLoading } = useHeroSlides();
  const addSlide = useAddHeroSlide();
  const deleteSlide = useDeleteHeroSlide();
  const reorderSlide = useReorderHeroSlide();
  const fileRef = useRef<HTMLInputElement>(null);

  const ordered = [...(slides ?? [])].sort((a, b) => a.position - b.position);

  function moveUp(slide: HeroSlide, index: number) {
    if (index === 0) return;
    reorderSlide.mutate({ a: slide, b: ordered[index - 1] });
  }
  function moveDown(slide: HeroSlide, index: number) {
    if (index === ordered.length - 1) return;
    reorderSlide.mutate({ a: slide, b: ordered[index + 1] });
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-display text-base text-foreground">Photos ({ordered.length})</h4>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={addSlide.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> {addSlide.isPending ? "Uploading…" : "Add photo"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const file = e.target.files?.[0]; if (file) addSlide.mutate(file); e.target.value = ""; }}
        />
      </div>

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

// ── Auth gates (unchanged behavior) ─────────────────────────────────────
function AdminAuthGate({
  signIn, signUp,
}: {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = mode === "signin" ? await signIn(email, password) : await signUp(email, password, fullName);
      if (result.error) setError(result.error);
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
      <SiteFooter />
      <MobileTabBar />
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
