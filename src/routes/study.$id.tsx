import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, FileWarning } from "lucide-react";
import { SiteHeader, SiteFooter, MobileTabBar } from "@/components/SiteHeader";
import { StudyPanel } from "@/components/StudyPanel";
import { useMaterial } from "@/lib/queries";

export const Route = createFileRoute("/study/$id")({
  component: StudyDocument,
});

function StudyDocument() {
  const { id } = Route.useParams();
  const { data: material, isLoading, isError } = useMaterial(id);

  return (
    <div className="min-h-screen bg-background pb-20">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <Link to="/study" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to study
        </Link>

        {isLoading ? (
          <div className="mt-6 h-40 animate-pulse rounded-2xl border border-border bg-surface-muted" />
        ) : isError || !material ? (
          <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-10 text-center">
            <FileWarning className="h-6 w-6 text-destructive" />
            <div className="text-sm font-semibold text-foreground">We couldn't load this material.</div>
            <p className="max-w-xs text-xs text-muted-foreground">It may have been removed, or the link might be wrong.</p>
            <Link to="/study" className="mt-1 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Back to study</Link>
          </div>
        ) : (
          <>
            <h1 className="mt-4 font-display text-3xl leading-tight text-foreground sm:text-4xl">{material.title}</h1>
            {material.courses && <p className="mt-1 text-sm text-muted-foreground">{material.courses.code} · {material.courses.title}</p>}
            <div className="mt-6"><StudyPanel material={material} /></div>
          </>
        )}
      </div>
      <SiteFooter />
      <MobileTabBar />
    </div>
  );
}
