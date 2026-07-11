import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader, SiteFooter, MobileTabBar } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/use-auth";
import { useSavedMaterials, useUpdateProfile, useProgrammes } from "@/lib/queries";
import { RequestMaterialForm } from "@/components/RequestMaterialForm";
import { Flame, Bookmark, ArrowRight, FileText, Trophy, Target, Pencil, Check, X, Download, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { loadStudentProfile } from "@/lib/student-profile";
import type { StudentProfile } from "@/lib/learnova-ai/types";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Your dashboard — Learnova" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user, profile, loading } = useAuth();
  const { data: saved } = useSavedMaterials();

  // The Learnova AI engine's student-memory profile — weak/strong topics,
  // quiz history, download history — lives in localStorage on this
  // device (see src/lib/student-profile.ts), so it's read once here
  // rather than through react-query.
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  useEffect(() => {
    if (user) setStudentProfile(loadStudentProfile(user.id, profile?.full_name || user.email || "Student"));
  }, [user, profile?.full_name]);

  if (loading) return <div className="min-h-screen bg-background" />;

  // Signed-out preview — all text uses foreground/muted-foreground so
  // it's readable on the light-navy background. No more dark-on-dark.
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

  return (
    <div className="min-h-screen bg-background pb-24">
      <SiteHeader />

      {/* Header — white text on hero bg (no more primary-foreground trap) */}
      <section className="bg-hero">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Welcome back</div>
          <h1 className="mt-2 font-display text-4xl leading-tight text-white sm:text-5xl">
            {profile.full_name?.split(" ")[0] || "Your"} dashboard
          </h1>
          <p className="mt-2 text-white/75">{profile.school} · Year {profile.year}</p>

          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile icon={Flame} label="Day streak" value={streak} accent="copper" />
            <StatTile icon={Bookmark} label="Saved" value={saved?.length ?? 0} accent="copper" />
            <StatTile icon={Download} label="Downloaded" value={downloadedCount} accent="gold" />
            <StatTile icon={Trophy} label="Quiz score" value={avgScorePct !== null ? `${avgScorePct}%` : "—"} accent="gold" />
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1fr_320px]">
        <section>
          <h2 className="font-display text-2xl text-foreground">Your topics</h2>
          <p className="mt-1 text-sm text-muted-foreground">Built from quizzes you've taken, on this device.</p>
          {weakTopics.length === 0 && strongTopics.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-border bg-surface-muted p-10 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-surface text-copper">
                <Sparkles className="h-5 w-5" />
              </div>
              <p className="mx-auto mt-4 max-w-xs text-sm text-muted-foreground">
                Take a quiz on any material and this fills in with what to focus on, and what you've already got down.
              </p>
            </div>
          ) : (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-copper">
                  <Target className="h-3.5 w-3.5" /> Focus on
                </div>
                {weakTopics.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">Nothing flagged yet — keep going.</p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {weakTopics.map((t) => (
                      <span key={t} className="rounded-md bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">{t}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-copper">
                  <Sparkles className="h-3.5 w-3.5" /> Strong in
                </div>
                {strongTopics.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">Nothing mastered yet — keep going.</p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {strongTopics.map((t) => (
                      <span key={t} className="rounded-md bg-teal/10 px-2 py-1 text-xs font-medium text-teal">{t}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <h2 className="mt-10 font-display text-2xl text-foreground">Saved materials</h2>
          {!saved?.length ? (
            <div className="mt-5 rounded-2xl border border-dashed border-border bg-surface-muted p-10 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-surface text-copper">
                <Bookmark className="h-5 w-5" />
              </div>
              <p className="mx-auto mt-4 max-w-xs text-sm text-muted-foreground">
                Nothing saved yet. Tap the bookmark on any material to keep it here.
              </p>
            </div>
          ) : (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {saved.map((s) => s.materials && (
                <Link key={s.material_id} to="/study/$id" params={{ id: s.material_id }} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-copper">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{s.materials.title}</div>
                    <div className="truncate text-xs text-muted-foreground">{s.materials.courses?.code ?? "General"}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-copper">Your profile</div>
            <div className="mt-4"><ProfileEditCard profile={profile} /></div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-copper">Request material</div>
            <p className="mt-2 text-sm text-muted-foreground">Can't find what you need? Ask and we'll notify you.</p>
            <div className="mt-4"><RequestMaterialForm /></div>
          </div>
        </aside>
      </div>

      <SiteFooter />
      <MobileTabBar />
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Flame;
  label: string;
  value: string | number;
  accent: "copper" | "gold";
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 backdrop-blur">
      <Icon className={`h-4 w-4 ${accent === "copper" ? "text-copper" : "text-gold"}`} />
      <div className="mt-3 font-display text-2xl text-white">{value}</div>
      <div className="text-xs text-white/70">{label}</div>
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
    semester: profile.semester as 1 | 2,
    phone: profile.phone ?? "",
  });

  function startEdit() {
    setForm({
      fullName: profile.full_name,
      studentNumber: profile.student_number ?? "",
      school: profile.school,
      programmeCode: profile.programme_code,
      year: profile.year,
      semester: profile.semester as 1 | 2,
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
        semester: form.semester,
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
        <div className="text-xs text-muted-foreground">
          {profile.programme_code || "No programme"} · Year {profile.year}, Sem {profile.semester}
        </div>
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
      <div className="flex gap-2">
        <select
          value={form.year}
          onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}
          className="w-1/2 rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
        >
          {[1, 2, 3, 4, 5].map((y) => (<option key={y} value={y}>Year {y}</option>))}
        </select>
        <select
          value={form.semester}
          onChange={(e) => setForm({ ...form, semester: Number(e.target.value) as 1 | 2 })}
          className="w-1/2 rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
        >
          <option value={1}>Semester 1</option><option value={2}>Semester 2</option>
        </select>
      </div>
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
