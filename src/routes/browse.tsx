import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader, SiteFooter, MobileTabBar } from "@/components/SiteHeader";
import { RequestMaterialForm } from "@/components/RequestMaterialForm";
import { useProgrammes, useCourses, usePopularCourses, useCourseMaterialStats, type CourseWithProgramme } from "@/lib/queries";
import { useOfflineLibrary } from "@/lib/offline";
import { Search, GraduationCap, ArrowRight, ChevronRight, History, Flame, Download, FileText } from "lucide-react";

export const Route = createFileRoute("/browse")({
  head: () => ({ meta: [{ title: "Browse programmes — Learnova" }] }),
  component: Browse,
});

const MATERIAL_TYPES = ["Notes", "Past Paper", "Slides", "Summary", "Assignment", "Outline"];
const ALL_SCOPE = "__all__";

// Rebuilt around one job: reach the right material in as few taps as
// possible. Search first, then a guided programme → year → course
// drill-down with a breadcrumb, so it's always obvious where you are —
// never a flat wall of every course at once. The full course list and
// material stats are fetched ONCE and filtered in memory for every view
// (search, programme, year, type) rather than refetching per filter
// change — the same "small catalogue, filter client-side" approach
// useSearchCourses already uses.
function Browse() {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<string | null>(null); // null = top level, "__all__" = every course, else a programme code
  const [year, setYear] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const { data: programmes } = useProgrammes();
  const { data: courses } = useCourses();
  const { data: popularCourses } = usePopularCourses(4);
  const { data: materialStats } = useCourseMaterialStats();
  const { items: offlineItems } = useOfflineLibrary();

  const stats = materialStats ?? {};
  const allCourses = courses ?? [];

  function resetScope() {
    setScope(null);
    setYear(null);
    setTypeFilter(null);
  }

  // Search overrides scope entirely — it's the fastest route, so it
  // shouldn't be scoped to whatever programme you happen to have open.
  const needle = query.trim().toLowerCase();
  const searchResults = needle
    ? allCourses.filter((c) => {
        const haystacks = [c.code, c.title, c.lecturer ?? "", ...(c.topics ?? [])];
        return haystacks.some((h) => h && h.toLowerCase().includes(needle));
      })
    : [];

  // Recently opened — derived from the same offline library that powers the homepage's "Continue studying."
  const recentCourses: CourseWithProgramme[] = [];
  const seenCodes = new Set<string>();
  for (const item of offlineItems) {
    const code = item.material.courses?.code;
    if (!code || seenCodes.has(code)) continue;
    seenCodes.add(code);
    const course = allCourses.find((c) => c.code === code);
    if (course) recentCourses.push(course);
    if (recentCourses.length >= 5) break;
  }

  // Real course + material counts per programme, not just a name.
  const programmeStats = new Map<string, { courses: number; materials: number }>();
  for (const c of allCourses) {
    if (!c.programme_code) continue;
    const entry = programmeStats.get(c.programme_code) ?? { courses: 0, materials: 0 };
    entry.courses += 1;
    entry.materials += stats[c.code]?.count ?? 0;
    programmeStats.set(c.programme_code, entry);
  }

  const selectedProgramme = scope && scope !== ALL_SCOPE ? (programmes ?? []).find((p) => p.code === scope) : undefined;
  const yearOptions = selectedProgramme
    ? Array.from({ length: selectedProgramme.duration_years }, (_, i) => i + 1)
    : [1, 2, 3, 4, 5];

  const scopedCourses = allCourses.filter((c) => {
    if (selectedProgramme && c.programme_code !== selectedProgramme.code) return false;
    if (year && c.year !== year) return false;
    return true;
  });
  const visibleCourses = scopedCourses.filter((c) => {
    if (typeFilter === "Downloaded") return offlineItems.some((o) => o.material.courses?.code === c.code);
    if (typeFilter) return (stats[c.code]?.types ?? []).includes(typeFilter);
    return true;
  });

  return (
    <div className="min-h-screen bg-background pb-20">
      <SiteHeader />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="text-xs font-medium uppercase tracking-[0.2em] text-copper">Browse</div>
        <h1 className="mt-2 font-display text-4xl leading-tight text-foreground sm:text-5xl">Programmes & courses</h1>

        <div className="relative mt-6 max-w-2xl">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by course code, title, lecturer, or topic"
            className="w-full rounded-2xl border border-border bg-surface py-3 pl-11 pr-4 text-sm text-foreground shadow-soft placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
        </div>

        {needle ? (
          <div className="mt-8">
            <p className="text-xs text-muted-foreground">{searchResults.length} course{searchResults.length === 1 ? "" : "s"} match</p>
            <div className="mt-3 space-y-2">
              {searchResults.map((c) => (
                <CourseRow key={c.code} course={c} fileCount={stats[c.code]?.count ?? 0} downloaded={offlineItems.some((o) => o.material.courses?.code === c.code)} />
              ))}
            </div>
            {searchResults.length === 0 && <EmptyState query={query} />}
          </div>
        ) : scope === null ? (
          <>
            {recentCourses.length > 0 && (
              <section className="mt-10">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><History className="h-3.5 w-3.5" /> Recently opened</p>
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {recentCourses.map((c) => (
                    <Link key={c.code} to="/courses/$code" params={{ code: c.code.toLowerCase().replace(/\s+/g, "-") }} className="shrink-0 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:border-primary/40">
                      {c.code}
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {(popularCourses?.length ?? 0) > 0 && (
              <section className="mt-8">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Flame className="h-3.5 w-3.5" /> Popular</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {popularCourses!.map((c) => (
                    <CourseRow key={c.code} course={c} fileCount={stats[c.code]?.count ?? 0} downloaded={offlineItems.some((o) => o.material.courses?.code === c.code)} />
                  ))}
                </div>
              </section>
            )}

            <section className="mt-10">
              <div className="flex items-end justify-between gap-4">
                <h2 className="font-display text-2xl text-foreground">Pick your programme</h2>
                <button onClick={() => setScope(ALL_SCOPE)} className="shrink-0 text-sm font-semibold text-copper hover:underline">
                  Or see all courses
                </button>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {(programmes ?? []).map((p) => {
                  const s = programmeStats.get(p.code) ?? { courses: 0, materials: 0 };
                  return (
                    <button
                      key={p.code}
                      onClick={() => setScope(p.code)}
                      className="group flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:border-primary/40"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">{p.name}</div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {s.materials} material{s.materials === 1 ? "" : "s"} · {s.courses} course{s.courses === 1 ? "" : "s"} · {p.duration_years}yr
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-copper" />
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        ) : (
          <div className="mt-8">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <button onClick={resetScope} className="font-semibold text-copper hover:underline">CBU</button>
              <ChevronRight className="h-3 w-3" />
              <span className="font-medium text-foreground">{scope === ALL_SCOPE ? "All courses" : selectedProgramme?.name}</span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <FilterChip active={!year} onClick={() => setYear(null)} label="All years" />
              {yearOptions.map((y) => (<FilterChip key={y} active={year === y} onClick={() => setYear(y)} label={`Year ${y}`} />))}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <FilterChip active={!typeFilter} onClick={() => setTypeFilter(null)} label="All" />
              {MATERIAL_TYPES.map((t) => (<FilterChip key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)} label={t} />))}
              <FilterChip active={typeFilter === "Downloaded"} onClick={() => setTypeFilter("Downloaded")} label="Downloaded" icon={Download} />
            </div>

            <div className="mt-6 space-y-2">
              {visibleCourses.map((c) => (
                <CourseRow key={c.code} course={c} fileCount={stats[c.code]?.count ?? 0} downloaded={offlineItems.some((o) => o.material.courses?.code === c.code)} />
              ))}
            </div>
            {visibleCourses.length === 0 && <EmptyState query={query} />}
          </div>
        )}
      </div>
      <SiteFooter />
      <MobileTabBar />
    </div>
  );
}

function CourseRow({ course, fileCount, downloaded }: { course: CourseWithProgramme; fileCount: number; downloaded: boolean }) {
  return (
    <Link
      to="/courses/$code"
      params={{ code: course.code.toLowerCase().replace(/\s+/g, "-") }}
      className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
    >
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-copper"><FileText className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-foreground">{course.code} · {course.title}</span>
          {downloaded && <Download className="h-3 w-3 shrink-0 text-copper" />}
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {fileCount > 0 ? `${fileCount} file${fileCount === 1 ? "" : "s"}` : "No materials yet"}
          {course.lecturer ? ` · ${course.lecturer}` : ""}
        </div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-copper" />
    </Link>
  );
}

function FilterChip({ active, onClick, label, icon: Icon }: { active: boolean; onClick: () => void; label: string; icon?: typeof Download }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-muted-foreground hover:text-foreground"}`}
    >
      {Icon && <Icon className="h-3 w-3" />} {label}
    </button>
  );
}

function EmptyState({ query }: { query?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface-muted p-8 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-surface text-copper"><GraduationCap className="h-6 w-6" /></div>
      <h3 className="mt-4 text-lg font-semibold text-foreground">No course matches yet</h3>
      <p className="mt-1 text-sm text-muted-foreground">Try a different course code, or tell us what's missing.</p>
      <div className="mx-auto mt-5 max-w-sm text-left">
        <RequestMaterialForm defaultTitle={query} />
      </div>
    </div>
  );
}
