import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader, SiteFooter, MobileTabBar } from "@/components/SiteHeader";
import { SearchBar } from "@/components/SearchBar";
import { CourseCard } from "@/components/CourseCard";
import { useUniversalSearch } from "@/lib/queries";
import { useAuth } from "@/hooks/use-auth";
import { FileText, SearchX } from "lucide-react";

export const Route = createFileRoute("/search")({
  validateSearch: (search: Record<string, unknown>) => ({ q: (search.q as string) ?? "" }),
  head: () => ({ meta: [{ title: "Search — Learnova" }] }),
  component: SearchPage,
});

function SearchPage() {
  const { q } = Route.useSearch();
  const { profile } = useAuth();
  const { data: results } = useUniversalSearch(q, profile?.programme_code ?? null);
  const courses = results?.courses ?? [];
  const materials = results?.materials ?? [];
  const total = courses.length + materials.length;

  return (
    <div className="min-h-screen bg-background pb-20">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="text-xs font-medium uppercase tracking-[0.2em] text-copper">Search</div>
        <h1 className="mt-2 font-display text-4xl leading-tight text-foreground sm:text-5xl">
          {q ? <>Results for <span className="text-gradient-gold">"{q}"</span></> : "Find anything, fast"}
        </h1>
        <div className="mt-6 max-w-2xl"><SearchBar initial={q} /></div>
        <div className="mt-4 text-xs text-muted-foreground">
          {total} {total === 1 ? "result" : "results"}{profile?.programme_code ? ` curated for ${profile.programme_code}` : ""}
        </div>

        {total === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-border bg-surface-muted p-10 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-surface text-copper"><SearchX className="h-6 w-6" /></div>
            <h3 className="mt-4 text-lg font-semibold text-foreground">Nothing here yet</h3>
            <Link to="/study" className="mt-4 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Request material</Link>
          </div>
        ) : (
          <div className="mt-6 space-y-8">
            {materials.length > 0 && (
              <section>
                <h2 className="font-display text-2xl text-foreground">Materials</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {materials.map((m) => (
                    <Link key={m.id} to="/study/$id" params={{ id: m.id }} className="group card-hover flex items-center gap-4 rounded-2xl border border-border bg-card p-4 hover:border-primary/30 hover:shadow-soft">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><FileText className="h-5 w-5" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-foreground">{m.title}</div>
                        <div className="truncate text-xs text-muted-foreground">{m.courses?.code ?? "General"} · {m.type}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
            {courses.length > 0 && (
              <section>
                <h2 className="font-display text-2xl text-foreground">Courses</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{courses.map((c) => (<CourseCard key={c.code} course={c} />))}</div>
              </section>
            )}
          </div>
        )}
      </div>
      <SiteFooter />
      <MobileTabBar />
    </div>
  );
}
