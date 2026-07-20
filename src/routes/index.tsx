import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader, SiteFooter, MobileTabBar } from "@/components/SiteHeader";
import { SearchBar } from "@/components/SearchBar";
import { HeroImageStrip } from "@/components/HeroCarousel";
import { RequestMaterialForm } from "@/components/RequestMaterialForm";
import { useAuth } from "@/hooks/use-auth";
import { useProgrammes, useCourses, useRecentMaterials, useSavedMaterials } from "@/lib/queries";
import { useOfflineLibrary } from "@/lib/offline";
import { ArrowRight, History, Sparkles, Bookmark, Download, HelpCircle } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Learnova — Study smarter at CBU" },
      { name: "description", content: "Find course notes, past papers, summaries and revision tools built for Copperbelt University students. Independent. Fast. Free to browse." },
      { property: "og:title", content: "Learnova — Study smarter at CBU" },
      { property: "og:url", content: "/" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: Home,
});

// Homepage, pass two. Three jobs: say what Learnova is, get a returning
// student back to what they were doing, get anyone into the library
// with zero friction. "Popular courses" and "How it works" are gone —
// neither was in the brief, and both mostly repeated something already
// said elsewhere on the page. Everything below only renders when it has
// something real to show — an empty catalogue, a first visit, or a
// signed-out browser are all normal states, not bugs.
function Home() {
  const { user } = useAuth();
  const { data: programmes } = useProgrammes();
  const { data: courses } = useCourses();
  const { data: recentMaterials } = useRecentMaterials(6);
  const { data: savedMaterials } = useSavedMaterials();
  const { items: offlineItems } = useOfflineLibrary(6);

  const courseCountByProgramme = new Map<string, number>();
  for (const c of courses ?? []) {
    if (!c.programme_code) continue;
    courseCountByProgramme.set(c.programme_code, (courseCountByProgramme.get(c.programme_code) ?? 0) + 1);
  }

  const continuing = offlineItems[0];
  const hasSaved = !!user && (savedMaterials?.length ?? 0) > 0;
  const hasDownloaded = offlineItems.length > 0;

  return (
    <div className="min-h-screen bg-background pb-24">
      <SiteHeader />

      {/* HERO IMAGE — dedicated crossfade frame, unchanged size/position/behaviour */}
      <HeroImageStrip />

      {/* HEADLINE + SEARCH — quiet, centered, plenty of breathing room */}
      <section className="mx-auto max-w-3xl px-4 pb-4 pt-10 text-center sm:px-6 sm:pt-14">
        <h1 className="font-display text-4xl leading-[1.05] tracking-tight text-foreground sm:text-6xl">
          Find. Learn. Revise.{" "}
          <span className="text-gradient-gold">Repeat.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
          The calm study companion for Copperbelt University students.
        </p>
        <div className="mx-auto mt-10 max-w-xl">
          <SearchBar />
        </div>
      </section>

      {/* CONTINUE STUDYING — the Spotify move. Backed by the existing
          offline library's lastOpenedAt, which is device-local, so this
          works for anyone who's opened something before, signed in or
          not. Hidden entirely on a first visit. */}
      {continuing && (
        <section className="mx-auto max-w-3xl px-4 pt-16 sm:px-6 sm:pt-20">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-copper">Pick up where you left off</div>
          <Link
            to="/study/$id"
            params={{ id: continuing.material.id }}
            className="group mt-4 flex items-center gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
          >
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-copper"><History className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-semibold text-foreground">{continuing.material.title}</div>
              <div className="truncate text-xs text-muted-foreground">{continuing.material.courses?.code ?? "General"}</div>
            </div>
            <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-copper">
              Resume <ArrowRight className="ml-0.5 inline h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        </section>
      )}

      {/* BROWSE BY PROGRAMME — same cards, now with a real course count instead of just name + school */}
      <section className="mx-auto max-w-6xl px-4 pt-20 sm:px-6 sm:pt-28">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-copper">Browse</div>
        <h2 className="mt-2 font-display text-3xl leading-tight text-foreground sm:text-4xl">
          Pick your programme
        </h2>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(programmes ?? []).map((p) => {
            const count = courseCountByProgramme.get(p.code) ?? 0;
            return (
              <Link
                key={p.code}
                to="/browse"
                className="group flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">{p.name}</div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {p.school} · {count} course{count === 1 ? "" : "s"}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-copper" />
              </Link>
            );
          })}
        </div>
      </section>

      {/* RECENTLY ADDED — proof the library is alive. Ordered by upload
          date, a different claim from "popular" (engagement), which is
          why this replaces that section rather than sitting next to it. */}
      {(recentMaterials?.length ?? 0) > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-20 sm:px-6 sm:pt-28">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-copper">Fresh</div>
              <h2 className="mt-2 font-display text-3xl leading-tight text-foreground sm:text-4xl">
                Recently added
              </h2>
            </div>
            <Link to="/browse" className="hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-copper hover:underline sm:inline-flex">
              Browse all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recentMaterials!.map((m) => (
              <Link
                key={m.id}
                to="/study/$id"
                params={{ id: m.id }}
                className="group flex items-start gap-3 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
              >
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-copper" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">{m.title}</div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{m.courses?.code ?? "General"} · {m.type}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* YOUR LIBRARY — Saved needs an account (tied to profile_id);
          Downloaded is device-local and works either way. Whichever
          applies shows; the whole section hides if neither does. */}
      {(hasSaved || hasDownloaded) && (
        <section className="mx-auto max-w-6xl px-4 pt-20 sm:px-6 sm:pt-28">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-copper">Yours</div>
          <h2 className="mt-2 font-display text-3xl leading-tight text-foreground sm:text-4xl">
            Your library
          </h2>
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            {hasSaved && (
              <div className="rounded-2xl border border-border bg-card p-6">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><Bookmark className="h-4 w-4 text-copper" /> Saved</p>
                <div className="mt-3 divide-y divide-border">
                  {savedMaterials!.slice(0, 4).map((s) => s.materials && (
                    <Link key={s.material_id} to="/study/$id" params={{ id: s.material_id }} className="block truncate py-2.5 text-sm text-foreground hover:text-copper">
                      {s.materials.title}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {hasDownloaded && (
              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><Download className="h-4 w-4 text-copper" /> Downloaded</p>
                  <Link to="/offline" className="text-xs font-semibold text-copper hover:underline">See all</Link>
                </div>
                <div className="mt-3 divide-y divide-border">
                  {offlineItems.slice(0, 4).map((o) => (
                    <Link key={o.material.id} to="/study/$id" params={{ id: o.material.id }} className="block truncate py-2.5 text-sm text-foreground hover:text-copper">
                      {o.material.title}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* MISSING MATERIAL REQUEST — same form used on course pages, no changes to it */}
      <section className="mx-auto max-w-2xl px-4 pt-20 sm:px-6 sm:pt-28">
        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="flex items-center gap-1.5 font-display text-xl text-foreground"><HelpCircle className="h-4 w-4 text-copper" /> Can't find something?</p>
          <p className="mt-1 text-sm text-muted-foreground">Tell us what's missing and we'll add it.</p>
          <div className="mt-4"><RequestMaterialForm /></div>
        </div>
      </section>

      {/* CREATE ACCOUNT — only for signed-out visitors now; a returning student already has everything above */}
      {!user && (
        <section className="mx-auto max-w-6xl px-4 pb-20 pt-20 sm:px-6 sm:pb-28 sm:pt-28">
          <div className="relative overflow-hidden rounded-3xl bg-hero p-10 shadow-elegant sm:p-14">
            <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-gold/20 blur-3xl" />
            <div className="relative max-w-xl">
              <h2 className="font-display text-3xl leading-tight text-white sm:text-4xl">
                Your next study session starts here.
              </h2>
              <p className="mt-3 text-white/75">
                Create a free account for a personal dashboard tailored to your programme and year.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link to="/auth" className="inline-flex items-center gap-1.5 rounded-xl bg-gold-gradient px-5 py-3 text-sm font-bold text-gold-foreground hover:opacity-95">
                  Create free account <ArrowRight className="h-4 w-4" />
                </Link>
                <Link to="/browse" className="inline-flex items-center gap-1.5 rounded-xl border border-white/25 bg-white/5 px-5 py-3 text-sm font-semibold text-white backdrop-blur hover:bg-white/10">
                  Browse programmes
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      <SiteFooter />
      <MobileTabBar />
    </div>
  );
         }
