import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader, SiteFooter, MobileTabBar } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/use-auth";
import { useSavedMaterials } from "@/lib/queries";
import { RequestMaterialForm } from "@/components/RequestMaterialForm";
import { Flame, Bookmark, ArrowRight, FileText } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Your dashboard — Learnova" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user, profile, loading } = useAuth();
  const { data: saved } = useSavedMaterials();

  if (loading) return <div className="min-h-screen bg-background" />;

  if (!user || !profile) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <SiteHeader />
        <section className="bg-hero text-primary-foreground">
          <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-gold">Preview</div>
            <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">Your dashboard, once you sign in</h1>
            <p className="mt-2 max-w-lg text-primary-foreground/75">Saved materials, a study streak, and requests — all live here once you have an account.</p>
            <Link to="/auth" className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-gold-gradient px-5 py-2.5 text-sm font-bold text-gold-foreground hover:opacity-95">Create free account <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </section>
        <SiteFooter />
        <MobileTabBar />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <SiteHeader />
      <section className="bg-hero text-primary-foreground">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-gold">Welcome back</div>
          <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">{profile.full_name || "Your"} dashboard</h1>
          <p className="mt-2 max-w-lg text-primary-foreground/75">{profile.school} · Year {profile.year}</p>

          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <Flame className="h-4 w-4 text-gold" />
              <div className="mt-3 font-display text-2xl text-primary-foreground">{profile.current_streak}</div>
              <div className="text-xs text-primary-foreground/70">Day streak</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <Flame className="h-4 w-4 text-copper" />
              <div className="mt-3 font-display text-2xl text-primary-foreground">{profile.longest_streak}</div>
              <div className="text-xs text-primary-foreground/70">Best streak</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <Bookmark className="h-4 w-4 text-teal" />
              <div className="mt-3 font-display text-2xl text-primary-foreground">{saved?.length ?? 0}</div>
              <div className="text-xs text-primary-foreground/70">Saved materials</div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 md:grid-cols-[1fr_300px]">
        <section>
          <h2 className="font-display text-2xl text-foreground">Saved materials</h2>
          {!saved?.length ? (
            <div className="mt-4 rounded-2xl border border-dashed border-border bg-surface-muted p-8 text-center">
              <div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-surface text-copper"><Bookmark className="h-5 w-5" /></div>
              <p className="mx-auto mt-3 max-w-xs text-sm text-muted-foreground">Nothing saved yet. Tap the bookmark on any material to keep it here.</p>
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {saved.map((s) => s.materials && (
                <Link key={s.material_id} to="/study/$id" params={{ id: s.material_id }} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 hover:border-primary/30">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><FileText className="h-4 w-4" /></div>
                  <div className="min-w-0"><div className="truncate text-sm font-semibold text-foreground">{s.materials.title}</div><div className="truncate text-xs text-muted-foreground">{s.materials.courses?.code ?? "General"}</div></div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-copper">Request material</div>
            <p className="mt-2 text-sm text-muted-foreground">Can't find what you need? Ask and we'll notify you.</p>
            <div className="mt-3"><RequestMaterialForm /></div>
          </div>
        </aside>
      </div>

      <SiteFooter />
      <MobileTabBar />
    </div>
  );
      }
