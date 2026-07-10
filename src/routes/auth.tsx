import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Logo } from "@/components/SiteHeader";
import { useMemo, useState } from "react";
import { ArrowRight, Info } from "lucide-react";
import campusGate from "@/assets/campus-gate.asset.json";
import { useAuth } from "@/hooks/use-auth";
import { useProgrammes } from "@/lib/queries";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Learnova" },
      { name: "description", content: "Sign in or create your Learnova account to save materials and track study progress." },
    ],
  }),
  component: Auth,
});

function Auth() {
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();
  const { data: programmes } = useProgrammes();

  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [fullName, setFullName] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [school, setSchool] = useState("");
  const [programmeCode, setProgrammeCode] = useState("");
  const [year, setYear] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const schools = useMemo(() => Array.from(new Set((programmes ?? []).map((p) => p.school))).sort(), [programmes]);
  const programmesForSchool = useMemo(() => (programmes ?? []).filter((p) => p.school === school), [programmes, school]);

  // Sign-up is immediate — no "check your email" step. Create the account,
  // land straight in the dashboard. (See use-auth.tsx for what happens in
  // the one edge case where the Supabase project itself still requires
  // email confirmation — that's a project setting, not something this
  // screen controls.)
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "signup") {
        if (!school || !programmeCode) throw new Error("Pick your school and programme.");
        const { error: err } = await signUp({ email, password, fullName, studentNumber, school, programmeCode, year: Number(year) });
        if (err) throw new Error(err);
      } else {
        const { error: err } = await signIn(email, password);
        if (err) throw new Error(err);
      }
      navigate({ to: "/dashboard" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
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
            <p className="mt-2 max-w-xs text-primary-foreground/75">Everything you need, organised by school, programme and year.</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col px-6 py-8 sm:px-10">
        <div className="flex items-center justify-between md:hidden"><Logo /></div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h2 className="font-display text-3xl leading-tight text-foreground">
            {mode === "signup" ? "Create your account" : "Welcome back"}
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {mode === "signup" ? "Personal dashboard for your programme in under a minute." : "Sign in to continue studying."}
          </p>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
              {error}
            </div>
          )}

          <form className="mt-6 space-y-3" onSubmit={handleSubmit}>
            {mode === "signup" && (
              <>
                <Field label="Full name" value={fullName} onChange={setFullName} placeholder="Chanda Mwansa" required />
                <Field label="Student number" value={studentNumber} onChange={setStudentNumber} placeholder="20220001" required />
              </>
            )}
            <Field label="Email" value={email} onChange={setEmail} placeholder="you@example.com" type="email" required />
            {mode === "signup" && (
              <>
                <SelectField
                  label="School"
                  value={school}
                  onChange={(v) => { setSchool(v); setProgrammeCode(""); }}
                  options={[{ value: "", label: "Select your school" }, ...schools.map((s) => ({ value: s, label: s }))]}
                />
                <SelectField
                  label="Programme"
                  value={programmeCode}
                  onChange={setProgrammeCode}
                  options={[{ value: "", label: school ? "Select your programme" : "Pick a school first" }, ...programmesForSchool.map((p) => ({ value: p.code, label: p.name }))]}
                />
                <SelectField
                  label="Year of study"
                  value={year}
                  onChange={setYear}
                  options={["1", "2", "3", "4", "5"].map((y) => ({ value: y, label: `Year ${y}` }))}
                />
              </>
            )}
            <Field label="Password" value={password} onChange={setPassword} placeholder="At least 8 characters" type="password" required minLength={8} />

            <button type="submit" disabled={submitting} className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft hover:opacity-95 disabled:opacity-60">
              {submitting ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"} <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "signup" ? "Already have an account? " : "New to Learnova? "}
            <button onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(null); }} className="font-semibold text-teal hover:underline">
              {mode === "signup" ? "Sign in" : "Create one"}
            </button>
          </div>
          <div className="mt-4 text-center text-xs text-muted-foreground">
            <Link to="/" className="hover:text-foreground">← Back to home</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, ...rest }: { label: string; value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-foreground">{label}</span>
      <input {...rest} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-input bg-surface px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30" />
    </label>
  );
}
function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-input bg-surface px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30">
        {options.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
    </label>
  );
    }
