import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Logo } from "@/components/SiteHeader";
import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import campusGate from "@/assets/campus-gate.asset.json";
import { useAuth } from "@/hooks/use-auth";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Learnova" },
      { name: "description", content: "One-tap sign in with Google to save materials and track your study progress on Learnova." },
    ],
  }),
  component: Auth,
});

function Auth() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [loading, user, navigate]);

  async function handleGoogle() {
    setError(null);
    setSubmitting(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw result.error;
      if (!result.redirected) navigate({ to: "/dashboard" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start Google sign-in. Try again in a moment.");
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
          <h2 className="font-display text-3xl leading-tight text-foreground">Get started in seconds</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">Continue with your Google account — no forms, no email verification, straight to your dashboard.</p>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogle}
            disabled={submitting}
            className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold text-foreground shadow-soft transition-colors hover:bg-surface-muted disabled:opacity-60"
          >
            <GoogleGlyph />
            {submitting ? "Opening Google…" : "Continue with Google"}
          </button>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            By continuing, you agree to Learnova's terms and privacy policy.
          </p>
          <div className="mt-4 text-center text-xs text-muted-foreground">
            <Link to="/" className="hover:text-foreground">← Back to home</Link>
          </div>
        </div>
      </div>
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
