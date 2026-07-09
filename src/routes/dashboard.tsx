import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader, SiteFooter, MobileTabBar } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/use-auth";
import { useSavedMaterials } from "@/lib/queries";
import { RequestMaterialForm } from "@/components/RequestMaterialForm";
import { Flame, Bookmark, ArrowRight, FileText, Trophy, Target } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Your dashboard — Learnova" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user, profile, loading } = useAuth();
  const { data: saved } = useSavedMaterials();

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
  const best = profile.longest_streak ?? 0;

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
            <StatTile icon={Trophy} label="Best streak" value={best} accent="gold" />
            <StatTile icon={Bookmark} label="Saved" value={saved?.length ?? 0} accent="copper" />
            <StatTile icon={Target} label="This week" value={`${Math.min(streak, 7)}/7`} accent="gold" />
          </div>

          {/* 7-day streak ribbon — gamified without being childish */}
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white">This week</span>
              <span className="text-white/60">Keep the copper seam glowing</span>
            </div>
            <div className="mt-4 flex gap-1.5">
              {Array.from({ length: 7 }).map((_, i) => {
                const filled = i < Math.min(streak, 7);
                return (
                  <div
                    key={i}
                    className={`h-8 flex-1 rounded-md transition-all ${
                      filled
                        ? "bg-gradient-to-t from-copper to-gold shadow-[0_0_16px_oklch(0.7_0.16_48_/_0.5)]"
                        : "bg-white/[0.06]"
                    }`}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1fr_320px]">
        <section>
          <h2 className="font-display text-2xl text-foreground">Saved materials</h2>
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
