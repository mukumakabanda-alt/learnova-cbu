import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/SiteHeader";
import { useState } from "react";
import { ArrowRight, Info } from "lucide-react";
import campusGate from "@/assets/campus-gate.asset.json";

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
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="grid min-h-screen bg-background md:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-hero md:block">
        <div className="absolute inset-0 opacity-30 mix-blend-overlay" style={{ backgroundImage: `url(${campusGate.url})`, backgroundSize: "cover", backgroundPosition: "center" }} />
        <div className="relative flex h-full flex-col justify-between p-10 text-primary-foreground">
          <Logo />
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-gold">For CBU students</div>
            <h1 className="mt-3 font-display text-4xl leading-tight">The calm way to study.</h1>
            <p className="mt-2 max-w-xs text-primary-foreground/75">Everything you need, organised by programme, year and semester.</p>
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

          {submitted && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-gold/30 bg-gold/10 p-3 text-xs text-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-copper" />
              Accounts aren't connected yet — this is a working preview of the sign-up flow, not a real submission.
            </div>
          )}

          <form className="mt-6 space-y-3" onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }}>
            {mode === "signup" && (
              <>
                <Field label="Full name" placeholder="Chanda Mwansa" />
                <Field label="Student number" placeholder="20220001" />
              </>
            )}
            <Field label="Email or phone" placeholder="you@example.com" type="email" />
            {mode === "signup" && (
              <div className="grid grid-cols-2 gap-3">
                <SelectField label="Year" options={["Year 1", "Year 2", "Year 3", "Year 4", "Year 5"]} />
                <SelectField label="Semester" options={["Semester 1", "Semester 2"]} />
              </div>
            )}
            <Field label="Password" placeholder="At least 8 characters" type="password" />

            <button type="submit" className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft hover:opacity-95">
              {mode === "signup" ? "Create account" : "Sign in"} <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "signup" ? "Already have an account? " : "New to Learnova? "}
            <button onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setSubmitted(false); }} className="font-semibold text-teal hover:underline">
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

function Field({ label, ...rest }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-foreground">{label}</span>
      <input {...rest} className="w-full rounded-xl border border-input bg-surface px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30" />
    </label>
  );
}
function SelectField({ label, options }: { label: string; options: string[] }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-foreground">{label}</span>
      <select className="w-full rounded-xl border border-input bg-surface px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30">
        {options.map((o) => (<option key={o}>{o}</option>))}
      </select>
    </label>
  );
}
