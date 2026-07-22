import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader, SiteFooter, MobileTabBar } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/use-auth";
import { useSavedMaterials, useUpdateProfile, useProgrammes, useMaterialsByIds, type MaterialLookup } from "@/lib/queries";
import { useOfflineLibrary } from "@/lib/offline";
import { RequestMaterialForm } from "@/components/RequestMaterialForm";
import {
  Flame, Bookmark, ArrowRight, Trophy, Target, Pencil, Check, X, Download, Sparkles,
  History, Compass, ListChecks,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { loadStudentProfile } from "@/lib/student-profile";
import type { StudentProfile, QuizAttempt } from "@/lib/learnova-ai/types";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type RecentQuizEntry = QuizAttempt & { material: MaterialLookup };

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Your dashboard — Learnova" }] }),
  component: Dashboard,
});

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// Download history is a plain array of material IDs, pushed on every
// download with no timestamp attached (see recordDownload in
// student-memory.ts) — so "recency" here means push order, not a real
// clock time. This walks from the end and keeps the first (i.e. most
// recent) occurrence of each ID, since the same material can appear more
// than once if it was downloaded twice.
function dedupeFromEnd(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = arr.length - 1; i >= 0; i--) {
    if (!seen.has(arr[i])) {
      seen.add(arr[i]);
      out.push(arr[i]);
    }
  }
  return out;
}

function Dashboard() {
  const { user, profile, loading } = useAuth();
  const { data: saved } = useSavedMaterials();
  const { items: offlineItems } = useOfflineLibrary(1);

  // The Learnova AI engine's student-memory profile — weak/strong topics,
  // quiz history, download history — lives in localStorage on this
  // device (see src/lib/student-profile.ts), so it's read once here
  // rather than through react-query.
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  useEffect(() => {
    if (user) setStudentProfile(loadStudentProfile(user.id, profile?.full_name || user.email || "Student"));
  }, [user, profile?.full_name]);

  // Recent quizzes have a real date. Recent downloads only have push
  // order (see dedupeFromEnd above). Both only carry a materialId, so
  // their titles/courses are resolved in one batched lookup rather than
  // fetching each individually.
  const recentQuizzes = [...(studentProfile?.quizHistory ?? [])]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 4);
  const recentDownloadIds = dedupeFromEnd(studentProfile?.downloadHistory ?? []).slice(0, 15);
  const lookupIds = [...new Set([...recentQuizzes.map((q) => q.materialId), ...recentDownloadIds])];
  const { data: lookup } = useMaterialsByIds(lookupIds);

  if (loading) return <div className="min-h-screen bg-background" />;

  if (!user || !profile) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <SiteHeader />
        <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-copper">Your dashboard</div>
          <h1 className="mt-3 font-display text-4xl leading-tight text-foreground sm:text-5xl">
            Sign in to unlock your streak.
          </h1>
          <p className="mx-auto mt-4 max-w-md text-base text-muted-foreground">
            Saved materials, study streaks, progress and personalised recommendations — all live here once you have an account.
          </p>
          <Link to="/auth" className="mt-8 inline-flex items-center gap-1.5 rounded-xl bg-gold-gradient px-5 py-3 text-sm font-bold text-gold-foreground hover:opacity-95">
            Create free account <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
        <SiteFooter />
        <MobileTabBar />
      </div>
    );
  }

  const streak = profile.current_streak ?? 0;
  const downloadedCount = new Set(studentProfile?.downloadHistory ?? []).size;
  const quizAttempts = studentProfile?.quizHistory.length ?? 0;
  const avgScorePct =
    quizAttempts > 0
      ? Math.round(
          (studentProfile!.quizHistory.reduce((sum, q) => sum + (q.total > 0 ? q.score / q.total : 0), 0) / quizAttempts) * 100,
        )
      : null;
  const weakTopics = studentProfile?.weakTopics ?? [];
  const strongTopics = studentProfile?.strongTopics ?? [];
  const continuing = offlineItems[0];

  const recentQuizDisplay: RecentQuizEntry[] = recentQuizzes
    .map((q) => ({ ...q, material: lookup?.[q.materialId] }))
    .filter((q): q is RecentQuizEntry => !!q.material);
  const recentDownloadDisplay = recentDownloadIds
    .slice(0, 4)
    .map((id) => lookup?.[id])
    .filter((m): m is MaterialLookup => !!m);

  // "Current focus" — real course codes tallied from quiz attempts
  // (which already carry courseCode directly) plus recently-downloaded
  // materials (resolved via the lookup above). Requires at least 2 hits
  // before a course counts as "focus" — a single incidental download
  // shouldn't get declared a focus area.
  const focusTally = new Map<string, number>();
  for (const q of studentProfile?.quizHistory ?? []) {
    if (q.courseCode) focusTally.set(q.courseCode, (focusTally.get(q.courseCode) ?? 0) + 1);
  }
  for (const id of recentDownloadIds) {
    const code = lookup?.[id]?.courses?.code;
    if (code) focusTally.set(code, (focusTally.get(code) ?? 0) + 1);
  }
  const focusCourses = [...focusTally.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([code]) => code);

  const hasAnyActivity = !!continuing || quizAttempts > 0 || (studentProfile?.downloadHistory.length ?? 0) > 0 || (saved?.length ?? 0) > 0;

  return (
    <div className="min-h-screen bg-background pb-24">
      <SiteHeader />

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-copper">Your dashboard</div>
        <h1 className="mt-2 font-display text-3xl leading-tight text-foreground sm:text-4xl">
          {greeting()}, {profile.full_name?.split(" ")[0] || "there"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {continuing ? "Ready to pick up where you left off?" : "Your study space is ready."}
        </p>

        {!hasAnyActivity ? (
          <div className="mt-8 rounded-2xl border border-dashed border-border bg-surface-muted p-10 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-surface text-copper">
              <Compass className="h-5 w-5" />
            </div>
            <p className="mx-auto mt-4 max-w-xs text-sm text-muted-foreground">
              Your study life starts here. Open something from your programme and this page fills in as you go.
            </p>
            <Link to="/browse" className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-95">
              Browse programmes <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <>
            {continuing && (
              <Link
                to="/study/$id"
                params={{ id: continuing.material.id }}
                className="group mt-6 flex items-center gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-copper"><History className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-copper">Continue studying</div>
                  <div className="truncate text-base font-semibold text-foreground">{continuing.material.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{continuing.material.courses?.code ?? "General"}</div>
                </div>
                <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-copper">
                  Resume <ArrowRight className="ml-0.5 inline h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            )}

            {focusCourses.length > 0 && (
              <div className="mt-8">
                <div className="text-xs font-semibold uppercase tracking-wide text-copper">Your current focus</div>
                <p className="mt-1 text-xs text-muted-foreground">Based on your recent quizzes and downloads.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {focusCourses.map((code) => (
                    <Link
                      key={code}
                      to="/courses/$code"
                      params={{ code: code.toLowerCase().replace(/\s+/g, "-") }}
                      className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground hover:border-primary/40"
                    >
                      {code}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {(weakTopics.length > 0 || strongTopics.length > 0) && (
              <div className="mt-8">
                <div className="text-xs font-semibold uppercase tracking-wide text-copper">Weak &amp; strong topics</div>
                <p className="mt-1 text-xs text-muted-foreground">Built from quizzes you've taken, on this device.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-destructive">
                      <Target className="h-3.5 w-3.5" /> Focus on
                    </div>
                    {weakTopics.length === 0 ? (
                      <p className="mt-3 text-xs text-muted-foreground">Nothing flagged — keep going.</p>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {weakTopics.map((t) => (<span key={t} className="rounded-md bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">{t}</span>))}
                      </div>
                    )}
                  </div>
                  <div className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-teal">
                      <Sparkles className="h-3.5 w-3.5" /> Strong in
                    </div>
                    {strongTopics.length === 0 ? (
                      <p className="mt-3 text-xs text-muted-foreground">Nothing mastered yet — keep going.</p>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {strongTopics.map((t) => (<span key={t} className="rounded-md bg-teal/10 px-2 py-1 text-xs font-medium text-teal">{t}</span>))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!!saved?.length && (
              <div className="mt-8">
                <div className="text-xs font-semibold uppercase tracking-wide text-copper">Saved</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {saved.map((s) => s.materials && (
                    <Link
                      key={s.material_id}
                      to="/study/$id"
                      params={{ id: s.material_id }}
                      className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 transition-colors hover:border-primary/40"
                    >
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-copper"><Bookmark className="h-4 w-4" /></div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">{s.materials.title}</div>
                        <div className="truncate text-xs text-muted-foreground">{s.materials.courses?.code ?? "General"}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {(recentQuizDisplay.length > 0 || recentDownloadDisplay.length > 0) && (
              <div className="mt-8">
                <div className="text-xs font-semibold uppercase tracking-wide text-copper">Recent activity</div>
                <p className="mt-1 text-xs text-muted-foreground">From quizzes and downloads on this device.</p>
                <div className="mt-3 grid gap-6 sm:grid-cols-2">
                  {recentQuizDisplay.length > 0 && (
                    <div>
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground"><ListChecks className="h-3.5 w-3.5 text-copper" /> Recent quizzes</p>
                      <div className="mt-2 space-y-1.5">
                        {recentQuizDisplay.map((q) => (
                          <Link
                            key={`${q.materialId}-${q.date}`}
                            to="/study/$id"
                            params={{ id: q.materialId }}
                            className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs hover:border-primary/40"
                          >
                            <span className="truncate text-foreground">{q.material.title}</span>
                            <span className="shrink-0 text-muted-foreground">{q.score}/{q.total} · {relativeTime(q.date)}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                  {recentDownloadDisplay.length > 0 && (
                    <div>
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground"><Download className="h-3.5 w-3.5 text-copper" /> Recently downloaded</p>
                      <div className="mt-2 space-y-1.5">
                        {recentDownloadDisplay.map((m) => (
                          <Link
                            key={m.id}
                            to="/study/$id"
                            params={{ id: m.id }}
                            className="flex items-center gap-2 truncate rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground hover:border-primary/40"
                          >
                            <span className="truncate">{m.title}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="mt-8">
              <div className="text-xs font-semibold uppercase tracking-wide text-copper">Study progress</div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile icon={Flame} label="Day streak" value={streak} />
                <StatTile icon={Bookmark} label="Saved" value={saved?.length ?? 0} />
                <StatTile icon={Download} label="Downloaded" value={downloadedCount} />
                <StatTile icon={Trophy} label="Quiz score" value={avgScorePct !== null ? `${avgScorePct}%` : "—"} />
              </div>
            </div>
          </>
        )}

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-copper">Your profile</div>
            <div className="mt-4"><ProfileEditCard profile={profile} /></div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-copper">Request material</div>
            <p className="mt-2 text-sm text-muted-foreground">Can't find what you need? Ask and we'll notify you.</p>
            <div className="mt-4"><RequestMaterialForm /></div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link to="/browse" className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted">
            <Compass className="h-3.5 w-3.5" /> Browse programmes
          </Link>
          <Link to="/offline" className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted">
            <Download className="h-3.5 w-3.5" /> Offline library
          </Link>
        </div>
      </div>

      <SiteFooter />
      <MobileTabBar />
    </div>
  );
}

function StatTile({ icon: Icon, label, value }: { icon: typeof Flame; label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <Icon className="h-4 w-4 text-copper" />
      <div className="mt-3 font-display text-2xl text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

// The "users update own profile" RLS policy has always allowed this — this
// card is what was actually missing: students previously had no way to
// fix a typo in their name, correct their programme/year after a
// transfer, or add a phone number once signed up.
function ProfileEditCard({ profile }: { profile: ProfileRow }) {
  const { data: programmes } = useProgrammes();
  const updateProfile = useUpdateProfile();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    fullName: profile.full_name,
    studentNumber: profile.student_number ?? "",
    school: profile.school,
    programmeCode: profile.programme_code,
    year: profile.year,
    phone: profile.phone ?? "",
  });

  function startEdit() {
    setForm({
      fullName: profile.full_name,
      studentNumber: profile.student_number ?? "",
      school: profile.school,
      programmeCode: profile.programme_code,
      year: profile.year,
      phone: profile.phone ?? "",
    });
    setEditing(true);
  }

  function save() {
    updateProfile.mutate(
      {
        fullName: form.fullName.trim(),
        studentNumber: form.studentNumber.trim() || null,
        school: form.school.trim(),
        programmeCode: form.programmeCode,
        year: form.year,
        phone: form.phone.trim() || null,
      },
      {
        onSuccess: () => {
          setEditing(false);
          toast.success("Profile updated.");
        },
        onError: () => toast.error("Couldn't save that — try again in a moment."),
      },
    );
  }

  if (!editing) {
    return (
      <div>
        <div className="text-sm font-semibold text-foreground">{profile.full_name || "Unnamed"}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {profile.student_number || "No student number"} · {profile.school}
        </div>
        <div className="text-xs text-muted-foreground">{profile.programme_code || "No programme"} · Year {profile.year}</div>
        <div className="text-xs text-muted-foreground">{profile.phone || "No phone number"}</div>
        <button
          onClick={startEdit}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit profile
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        value={form.fullName}
        onChange={(e) => setForm({ ...form, fullName: e.target.value })}
        placeholder="Full name"
        className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
      />
      <input
        value={form.studentNumber}
        onChange={(e) => setForm({ ...form, studentNumber: e.target.value })}
        placeholder="Student number"
        className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
      />
      <input
        value={form.school}
        onChange={(e) => setForm({ ...form, school: e.target.value })}
        placeholder="School"
        className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
      />
      <select
        value={form.programmeCode}
        onChange={(e) => setForm({ ...form, programmeCode: e.target.value })}
        className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
      >
        {(programmes ?? []).map((p) => (<option key={p.code} value={p.code}>{p.name}</option>))}
      </select>
      <select
        value={form.year}
        onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}
        className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
      >
        {[1, 2, 3, 4, 5].map((y) => (<option key={y} value={y}>Year {y}</option>))}
      </select>
      <input
        value={form.phone}
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
        placeholder="Phone (optional)"
        className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
      />
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={updateProfile.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" /> Save
        </button>
        <button onClick={() => setEditing(false)} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-muted px-3 py-1.5 text-xs font-semibold text-foreground">
          <X className="h-3.5 w-3.5" /> Cancel
        </button>
      </div>
    </div>
  );
}
