import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader, SiteFooter, MobileTabBar } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/use-auth";
import { useCatalog, useOpenRequests, useProgrammes, useCourses, useCreateCourse } from "@/lib/queries";
import { DocumentUpload } from "@/components/DocumentUpload";
import { useState } from "react";
import { Users, GraduationCap, FileText, Inbox, Plus, CheckCircle2, ShieldCheck, Copy, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin — Learnova" }, { name: "robots", content: "noindex" }],
  }),
  component: Admin,
});

function Admin() {
  const { user, profile, isAdmin, loading, signIn, signUp } = useAuth();
  const { data: materials } = useCatalog();
  const { data: requests } = useOpenRequests();
  const { data: programmes } = useProgrammes();
  const { data: courses } = useCourses();
  const qc = useQueryClient();

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

  return (
    <div className="min-h-screen bg-background pb-24">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-copper">Admin</div>
        <h1 className="mt-2 font-display text-4xl leading-tight text-foreground sm:text-5xl">Learnova control room</h1>

        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: FileText, label: "Materials ready", value: ready.length },
            { icon: Users, label: "Students", value: "—" },
            { icon: GraduationCap, label: "Programmes", value: programmes?.length ?? 0 },
            { icon: Inbox, label: "Open requests", value: openRequests.length },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-border bg-card p-5">
              <s.icon className="h-4 w-4 text-copper" />
              <div className="mt-3 font-display text-3xl text-foreground">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
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

          <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
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
            </div>
          </div>

          <NewCourseCard programmes={programmes ?? []} />
        </div>

        <div className="mt-8 rounded-2xl border border-border bg-card p-6">
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
  const sql = `update public.profiles set role = 'admin' where id = '${userId}';`;
  const [copied, setCopied] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-lg px-6 py-20">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-copper shadow-[0_0_28px_oklch(0.7_0.16_48_/_0.35)]">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="mt-6 font-display text-3xl text-foreground">You're one step away.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You're signed in but this account isn't marked as admin yet. Run this one-liner in the Cloud database editor to promote yourself, then refresh.
        </p>

        <div className="mt-6 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-copper" />
            One-time bootstrap. After the first admin exists, you can promote others from the admin panel.
          </div>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-surface p-3 text-[11px] leading-relaxed text-foreground">{sql}</pre>
          <button
            onClick={() => { navigator.clipboard.writeText(sql); setCopied(true); setTimeout(() => setCopied(false), 1600); }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
          >
            <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy SQL"}
          </button>
        </div>

        <button
          onClick={() => window.location.reload()}
          className="mt-6 text-xs font-semibold text-copper hover:underline"
        >
          I've run it — refresh →
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
        <button type="submit" disabled={createCourse.isPending} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          <Plus className="h-4 w-4" /> Add course
        </button>
      </form>
    </div>
  );
}
