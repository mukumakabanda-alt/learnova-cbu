import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader, SiteFooter, MobileTabBar } from "@/components/SiteHeader";
import { SearchBar } from "@/components/SearchBar";
import { CourseCard } from "@/components/CourseCard";
import { useProgrammes, useCourses } from "@/lib/queries";
import { GraduationCap } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/browse")({
  head: () => ({ meta: [{ title: "Browse programmes — Learnova" }] }),
  component: Browse,
});

function Browse() {
  const [prog, setProg] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const { data: programmes } = useProgrammes();
  const { data: courses } = useCourses({ programmeCode: prog, year });

  return (
    <div className="min-h-screen bg-background pb-20">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="text-xs font-medium uppercase tracking-[0.2em] text-copper">Browse</div>
        <h1 className="mt-2 font-display text-4xl leading-tight text-foreground sm:text-5xl">Programmes & courses</h1>
        <div className="mt-6 max-w-2xl"><SearchBar size="md" /></div>

        <div className="mt-10 grid gap-8 md:grid-cols-[280px_1fr]">
          <aside className="space-y-6">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Programme</div>
              <div className="grid gap-1">
                <FilterPill active={!prog} onClick={() => setProg(null)} label="All programmes" />
                {(programmes ?? []).map((p) => (<FilterPill key={p.code} active={prog === p.code} onClick={() => setProg(p.code)} label={p.name} />))}
              </div>
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Year of study</div>
              <div className="flex flex-wrap gap-2">
                <FilterChip active={!year} onClick={() => setYear(null)} label="All" />
                {[1, 2, 3, 4, 5].map((y) => (<FilterChip key={y} active={year === y} onClick={() => setYear(y)} label={`Year ${y}`} />))}
              </div>
            </div>
          </aside>

          <div>
            {(courses ?? []).length === 0 ? <EmptyState /> : (
              <div className="grid gap-4 sm:grid-cols-2">{(courses ?? []).map((c) => (<CourseCard key={c.code} course={c} />))}</div>
            )}
          </div>
        </div>
      </div>
      <SiteFooter />
      <MobileTabBar />
    </div>
  );
}

function FilterPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return <button onClick={onClick} className={`rounded-xl px-3 py-2 text-left text-sm transition-colors ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>{label}</button>;
}
function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return <button onClick={onClick} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-muted-foreground hover:text-foreground"}`}>{label}</button>;
}
function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface-muted p-10 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-surface text-copper"><GraduationCap className="h-6 w-6" /></div>
      <h3 className="mt-4 text-lg font-semibold text-foreground">No courses match yet</h3>
      <Link to="/study" className="mt-4 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Request material</Link>
    </div>
  );
          }
