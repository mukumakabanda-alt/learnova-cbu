import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Logo } from "@/components/SiteHeader";
import { useEffect, useState } from "react";
import { Info, Loader2 } from "lucide-react";
import campusGate from "@/assets/campus-gate.asset.json";
import { useAuth } from "@/hooks/use-auth";
import { useProgrammes } from "@/lib/queries";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Learnova" },
      { name: "description", content: "Quick sign-up for CBU students — just your name, student number and programme. No email verification." },
    ],
  }),
  component: Auth,
});

// Student accounts don't use a real email — we synthesise a stable
// internal one from the student number so Supabase Auth (which is
// email-based under the hood) still works, while the student themselves
// only ever types their student number + password.
const studentEmail = (sn: string) => `s${sn.trim().toLowerCase().replace(/[^a-z0-9]/g, "")}@student.learnova.app`;

type Mode = "student-signin" | "student-signup" | "admin";

function Auth() {
  const navigate = useNavigate();
  const { user, loading, signIn, signUp } = useAuth();
  const { data: programmes } = useProgrammes();
  const [mode, setMode] = useState<Mode>("student-signin");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Student fields
  const [fullName, setFullName] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [programmeCode, setProgrammeCode] = useState("");
  const [year, setYear] = useState(1);
  const [password, setPassword] = useState("");

  // Admin
  const [adminEmail, setAdminEmail] = useState("");

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [loading, user, navigate]);

  async function handleStudentSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!studentNumber.trim() || !password) { setError("Enter your student number and password."); return; }
    setSubmitting(true);
    const { error } = await signIn(studentEmail(studentNumber), password);
    setSubmitting(false);
    if (error) setError(/invalid/i.test(error) ? "That student number and password don't match. Try again, or tap Create account below." : error);
    else navigate({ to: "/dashboard" });
  }

  async function handleStudentSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fullName.trim() || !studentNumber.trim() || !programmeCode || password.length < 6) {
      setError("Fill in your name, student number, programme, and a password (at least 6 characters).");
      return;
    }
    const selectedProgramme = (programmes ?? []).find((programme) => programme.code === programmeCode);
    setSubmitting(true);
    const { error } = await signUp({
      email: studentEmail(studentNumber),
      password,
      fullName: fullName.trim(),
      studentNumber: studentNumber.trim(),
      school: selectedProgramme?.school ?? "",
      programmeCode,
      year,
    });
    setSubmitting(false);
    if (error) setError(error);
    else navigate({ to: "/dashboard" });
  }

  async function handleAdminSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!adminEmail.trim() || !password) { setError("Enter your admin email and password."); return; }
    setSubmitting(true);
    const { error } = await signIn(adminEmail.trim(), password);
    setSubmitting(false);
    if (error) setError(error);
    else navigate({ to: "/admin" });
  }

  async function handleGoogle() {
    setError(null);
    setSubmitting(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
      if (result.error) throw result.error;
      if (!result.redirected) navigate({ to: "/dashboard" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start Google sign-in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-background md:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-hero md:block">
        <div className="absolute inset-0 opacity-30 mix-blend-overlay" style={{ backgroundImage: `url(${campusGate.url})`, backgroundSize: "cover", backgroundPosition: "center" }} />
        <div className="relative flex h-full flex-col justify-between p-10 text-primary-foreground">
          <Logo />
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-gold">For CBU students</div>
            <h1 className="mt-3 font-display text-4xl leading-tight">The calm way to study.</h1>
            <p className="mt-2 max-w-xs text-primary-foreground/75">Everything you need, organised by programme and year.</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col px-6 py-8 sm:px-10">
        <div className="flex items-center justify-between md:hidden"><Logo /></div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          {mode !== "admin" ? (
            <>
              <h2 className="font-display text-3xl leading-tight text-foreground">
                {mode === "student-signup" ? "Create your account" : "Welcome back"}
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {mode === "student-signup"
                  ? "Quick sign-up — no email verification. Just your name, student number, programme and a password."
                  : "Sign in with your student number and password."}
              </p>

              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />{error}
                </div>
              )}

              {mode === "student-signup" ? (
                <form onSubmit={handleStudentSignUp} className="mt-6 space-y-3">
                  <Field label="Full name" value={fullName} onChange={setFullName} placeholder="Chipo Mwansa" autoComplete="name" />
                  <Field label="Student number" value={studentNumber} onChange={setStudentNumber} placeholder="20210001" autoComplete="username" />
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-muted-foreground">Programme</label>
                    <select
                      value={programmeCode}
                      onChange={(e) => setProgrammeCode(e.target.value)}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
                    >
                      <option value="">Select your programme…</option>
                      {(programmes ?? []).map((p) => (
                        <option key={p.code} value={p.code}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-muted-foreground">Year of study</label>
                    <select
                      value={year}
                      onChange={(e) => setYear(Number(e.target.value))}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
                    >
                      {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>Year {y}</option>)}
                    </select>
                  </div>
                  <Field label="Password" value={password} onChange={setPassword} type="password" placeholder="At least 6 characters" autoComplete="new-password" />
                  <button type="submit" disabled={submitting} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition-colors hover:bg-primary/90 disabled:opacity-60">
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}Create account
                  </button>
                  <p className="text-center text-xs text-muted-foreground">
                    Already have an account?{" "}
                    <button type="button" onClick={() => { setError(null); setMode("student-signin"); }} className="font-semibold text-primary hover:underline">Sign in</button>
                  </p>
                </form>
              ) : (
                <form onSubmit={handleStudentSignIn} className="mt-6 space-y-3">
                  <Field label="Student number" value={studentNumber} onChange={setStudentNumber} placeholder="20210001" autoComplete="username" />
                  <Field label="Password" value={password} onChange={setPassword} type="password" autoComplete="current-password" />
                  <button type="submit" disabled={submitting} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition-colors hover:bg-primary/90 disabled:opacity-60">
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}Sign in
                  </button>
                  <p className="text-center text-xs text-muted-foreground">
                    New here?{" "}
                    <button type="button" onClick={() => { setError(null); setMode("student-signup"); }} className="font-semibold text-primary hover:underline">Create an account</button>
                  </p>
                </form>
              )}

              <div className="mt-6 text-center text-xs text-muted-foreground">
                <button type="button" onClick={() => { setError(null); setMode("admin"); }} className="hover:text-foreground">Admin sign-in →</button>
              </div>
            </>
          ) : (
            <>
              <h2 className="font-display text-3xl leading-tight text-foreground">Admin sign-in</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">Use your admin email and password, or continue with Google.</p>

              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />{error}
                </div>
              )}

              <form onSubmit={handleAdminSignIn} className="mt-6 space-y-3">
                <Field label="Email" value={adminEmail} onChange={setAdminEmail} type="email" autoComplete="email" />
                <Field label="Password" value={password} onChange={setPassword} type="password" autoComplete="current-password" />
                <button type="submit" disabled={submitting} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition-colors hover:bg-primary/90 disabled:opacity-60">
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}Sign in
                </button>
              </form>

              <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
              </div>

              <button type="button" onClick={handleGoogle} disabled={submitting} className="inline-flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold text-foreground shadow-soft transition-colors hover:bg-surface-muted disabled:opacity-60">
                <GoogleGlyph />Continue with Google
              </button>

              <div className="mt-6 text-center text-xs text-muted-foreground">
                <button type="button" onClick={() => { setError(null); setMode("student-signin"); }} className="hover:text-foreground">← Back to student sign-in</button>
              </div>
            </>
          )}

          <div className="mt-6 text-center text-xs text-muted-foreground">
            <Link to="/" className="hover:text-foreground">← Back to home</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, autoComplete }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; autoComplete?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
      />
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C33.9 6.1 29.2 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C33.9 6.1 29.2 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.1 0 9.7-1.9 13.2-5.1l-6.1-5c-2 1.4-4.5 2.1-7.1 2.1-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.6 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.1 5c-.4.4 6.8-5 6.8-14.6 0-1.2-.1-2.3-.4-3.5z"/>
    </svg>
  );
}
