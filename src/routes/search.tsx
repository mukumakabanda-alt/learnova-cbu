import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader, SiteFooter, MobileTabBar } from "@/components/SiteHeader";
import { SearchBar } from "@/components/SearchBar";
import { CourseCard } from "@/components/CourseCard";
import { useSearchCourses } from "@/lib/queries";
import { SearchX } from "lucide-react";

export const Route = createFileRoute("/search")({
  validateSearch: (search: Record<string, unknown>) => ({ q: (search.q as string) ?? "" }),
  head: () => ({ meta: [{ title: "Search — Learnova" }] }),
  component: SearchPage,
});

function SearchPage() {
  const { q } = Route.useSearch();
  const { data: results } = useSearchCourses(q);

  return (
    <div className="min-h-screen bg-background pb-20">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="text-xs font-medium uppercase tracking-[0.2em] text-copper">Search</div>
        <h1 className="mt-2 font-display text-4xl leading-tight text-foreground sm:text-5xl">
          {q ? <>Results for <span className="text-gradient-gold">"{q}"</span></> : "Find anything, fast"}
        </h1>
        <div className="mt-6 max-w-2xl"><SearchBar initial={q} /></div>
        <div className="mt-4 text-xs text-muted-foreground">{(results ?? []).length} {(results ?? []).length === 1 ? "result" : "results"}</div>

        {(results ?? []).length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-border bg-surface-muted p-10 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-surface text-copper"><SearchX className="h-6 w-6" /></div>
            <h3 className="mt-4 text-lg font-semibold text-foreground">Nothing here yet</h3>
            <Link to="/study" className="mt-4 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Request material</Link>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{(results ?? []).map((c) => (<CourseCard key={c.code} course={c} />))}</div>
        )}
      </div>
      <SiteFooter />
      <MobileTabBar />
    </div>
  );
}
