import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { SiteHeader, SiteFooter, MobileTabBar } from "@/components/SiteHeader";
import { StudyPanel } from "@/components/StudyPanel";
import { useMaterial } from "@/lib/queries";

export const Route = createFileRoute("/study/$id")({
  component: StudyDocument,
});

function StudyDocument() {
  const { id } = Route.useParams();
  const { data: material, isLoading } = useMaterial(id);

  return (
    <div className="min-h-screen bg-background pb-20">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <Link to="/study" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to study
        </Link>

        {isLoading || !material ? (
          <div className="mt-6 h-40 animate-pulse rounded-2xl border border-border bg-surface-muted" />
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
