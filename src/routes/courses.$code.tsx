import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader, SiteFooter, MobileTabBar } from "@/components/SiteHeader";
import { useCourse, useMaterialsForCourse, useToggleSaved, useSavedMaterials, useIncrementDownload } from "@/lib/queries";
import { DocumentUpload } from "@/components/DocumentUpload";
import { DocumentViewer } from "@/components/DocumentViewer";
import { RequestMaterialForm } from "@/components/RequestMaterialForm";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft, Bookmark, Download, Eye, FileText } from "lucide-react";
import { forceDownload } from "@/lib/document-files";
import { toast } from "sonner";

export const Route = createFileRoute("/courses/$code")({
  head: ({ params }) => ({
    meta: [{ title: `${params.code.toUpperCase()} — Learnova` }],
  }),
  component: CoursePage,
});

function materialStatusLabel(status: string): string {
  switch (status) {
    case "processing":
      return "Generating study tools…";
    case "ready":
      return "Summary, flashcards & quiz ready";
    case "failed":
      return "Processing failed — try re-uploading";
    case "catalog_only":
    default:
      return "Catalogued";
  }
}

function CoursePage() {
  const { code } = Route.useParams();
  const { data: course, isLoading } = useCourse(code);
  const { data: materials } = useMaterialsForCourse(course?.code ?? "");
  const { user } = useAuth();
  const { data: saved } = useSavedMaterials();
  const toggleSaved = useToggleSaved();
  const incrementDownload = useIncrementDownload();
  const savedIds = new Set((saved ?? []).map((s) => s.material_id));

  // Tracks which specific bookmark buttons are mid-request, so a fast
  // double-tap on the same material is ignored instead of firing the
  // mutation twice — without disabling every OTHER bookmark button on the
  // page while one save is in flight.
  const [pendingSaveIds, setPendingSaveIds] = useState<Set<string>>(new Set());

  // Lets the row's own "View" button open the document right here,
  // instead of the only option being to navigate to /study/$id first —
  // same fix as the Study catalogue list.
  const [viewerMaterial, setViewerMaterial] = useState<{ id: string; file_path: string | null; title: string } | null>(null);

  function handleToggleSaved(materialId: string, nextSaved: boolean) {
    if (pendingSaveIds.has(materialId)) return;
    setPendingSaveIds((prev) => new Set(prev).add(materialId));
    toggleSaved.mutate(
      { materialId, save: nextSaved },
      {
        onSettled: () => {
          setPendingSaveIds((prev) => {
            const next = new Set(prev);
            next.delete(materialId);
            return next;
          });
        },
      },
    );
  }

  if (isLoading) return <div className="min-h-screen bg-background" />;
  if (!course) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto max-w-xl px-4 py-24 text-center">
          <h1 className="font-display text-4xl text-foreground">Course not found</h1>
          <Link to="/browse" className="mt-6 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Browse programmes</Link>
        </div>
      </div>
    );
  }

  // Was its own separate, half-broken implementation — a 60-second signed
  // URL, and window.open() called *after* an await, which mobile
  // browsers routinely block as a popup (see the long comment in
  // src/lib/document-files.ts). Now uses the same shared, working
  // download path as the study page and document viewer, so it behaves
  // identically everywhere: an hour-long signed URL, a real forced
  // save-to-device download via a blob: URL, and a visible error instead
  // of failing silently.
  async function downloadMaterial(filePath: string | null, materialId: string, title: string) {
    if (!filePath) return;
    try {
      await forceDownload(filePath, title);
      incrementDownload.mutate(materialId);
    } catch {
      toast.error("Couldn't download that file right now — try again in a moment.");
    }
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <SiteHeader />
      <div className="border-b border-border bg-surface-muted">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
          <Link to="/browse" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Back to browse</Link>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md bg-primary px-2 py-1 font-semibold uppercase tracking-wide text-primary-foreground">{course.code}</span>
            <span className="rounded-md bg-surface px-2 py-1 font-medium text-muted-foreground">{course.programmes?.name}</span>
            <span className="rounded-md bg-surface px-2 py-1 font-medium text-muted-foreground">Year {course.year} · Sem {course.semester}</span>
            {course.lecturer && <span className="rounded-md bg-surface px-2 py-1 font-medium text-muted-foreground">{course.lecturer}</span>}
          </div>
          <h1 className="mt-4 font-display text-4xl leading-tight text-foreground sm:text-5xl">{course.title}</h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">{course.description}</p>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1fr_320px]">
        <div>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl text-foreground">Materials</h2>
          </div>
          <div className="mt-4 grid gap-3">
            {(materials ?? []).length === 0 && (
              <div className="rounded-2xl border border-dashed border-border bg-surface-muted p-8 text-center text-sm text-muted-foreground">
                Nothing uploaded for this course yet — be the first.
              </div>
            )}
            {(materials ?? []).map((m) => {
              const isSaved = savedIds.has(m.id);
              const isPending = pendingSaveIds.has(m.id);
              return (
                <div key={m.id} className="group card-hover flex items-center gap-4 rounded-2xl border border-border bg-card p-4 hover:border-primary/30 hover:shadow-soft">
                  <Link to="/study/$id" params={{ id: m.id }} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><FileText className="h-5 w-5" /></Link>
                  <Link to="/study/$id" params={{ id: m.id }} className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><span className="rounded-md bg-copper/10 px-2 py-0.5 text-[11px] font-semibold text-copper">{m.type}</span>{m.pages && <span className="text-[11px] text-muted-foreground">{m.pages} pages</span>}</div>
                    <div className="mt-1 truncate text-sm font-semibold text-foreground">{m.title}</div>
                    <div className="text-xs text-muted-foreground">{materialStatusLabel(m.status)}</div>
                  </Link>
                  <button
                    onClick={() => handleToggleSaved(m.id, !isSaved)}
                    disabled={isPending}
                    aria-pressed={isSaved}
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border transition-colors disabled:cursor-wait disabled:opacity-60 ${isSaved ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-foreground hover:bg-primary hover:text-primary-foreground"}`}
                  >
                    <Bookmark className="h-4 w-4" />
                  </button>
                  {m.file_path && (
                    <button
                      onClick={() => setViewerMaterial({ id: m.id, file_path: m.file_path, title: m.title })}
                      aria-label={`Preview ${m.title}`}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-surface text-foreground hover:bg-primary hover:text-primary-foreground"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  )}
                  {m.file_path && (
                    <button onClick={() => downloadMaterial(m.file_path, m.id, m.title)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-surface text-foreground hover:bg-primary hover:text-primary-foreground"><Download className="h-4 w-4" /></button>
                  )}
                </div>
              );
            })}
          </div>

          <h2 className="mt-10 font-display text-2xl text-foreground">Course outline</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {course.topics.map((t: string, i: number) => (
              <div key={t} className="flex items-start gap-3 rounded-xl border border-border bg-card p-3">
                <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-primary/10 text-[11px] font-semibold text-primary">{String(i + 1).padStart(2, "0")}</div>
                <div className="text-sm font-medium text-foreground">{t}</div>
              </div>
            ))}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-copper">Add material to this course</div>
            <p className="mt-1 text-xs text-muted-foreground">Upload a PDF and it becomes a summary, flashcards and a quiz — for you and everyone after you.</p>
            <div className="mt-3"><DocumentUpload courseCode={course.code} /></div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-copper">In this course</div>
            <div className="mt-3 flex items-baseline gap-1.5"><div className="font-display text-3xl text-foreground">{materials?.length ?? 0}</div><div className="text-xs text-muted-foreground">materials available</div></div>
            {!user && <p className="mt-3 text-xs text-muted-foreground">Sign in to save this course and track what you've opened.</p>}
          </div>

          <div className="rounded-2xl border border-dashed border-border bg-surface-muted p-5">
            <div className="text-sm text-muted-foreground">Missing something?</div>
            <div className="mt-3"><RequestMaterialForm defaultCourseCode={course.code} /></div>
          </div>
        </aside>
      </div>

      <DocumentViewer
        open={!!viewerMaterial}
        onClose={() => setViewerMaterial(null)}
        materialId={viewerMaterial?.id ?? ""}
        filePath={viewerMaterial?.file_path ?? null}
        title={viewerMaterial?.title ?? ""}
      />

      <SiteFooter />
      <MobileTabBar />
    </div>
  );
    }
