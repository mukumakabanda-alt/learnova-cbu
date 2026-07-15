import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { SiteHeader, SiteFooter, MobileTabBar } from "@/components/SiteHeader";
import { DocumentUpload } from "@/components/DocumentUpload";
import { DocumentViewer } from "@/components/DocumentViewer";
import { RequestMaterialForm } from "@/components/RequestMaterialForm";
import { useCatalog, type MaterialWithCourse } from "@/lib/queries";
import { useAuth } from "@/hooks/use-auth";
import { FileText, Loader2, Search, Eye } from "lucide-react";

export const Route = createFileRoute("/study")({
  head: () => ({
    meta: [
      { title: "Study — Learnova" },
      { name: "description", content: "Every document Learnova has turned into a summary, flashcards and a quiz — browse it, or upload your own." },
    ],
  }),
  component: StudyHub,
});

function statusLabel(status: string) {
  switch (status) {
    case "processing":
      return "Generating…";
    case "catalog_only":
      return "Saved · no study tools yet";
    case "failed":
      return "Needs a re-upload";
    default:
      return "Ready";
  }
}

function StudyHub() {
  const [q, setQ] = useState("");
  const { profile } = useAuth();
  const [showAll, setShowAll] = useState(false);
  const programmeFilter = !showAll && profile?.programme_code ? profile.programme_code : null;
  const { data: materials, isLoading } = useCatalog(q, programmeFilter);

  // Lets a card's "View" button open the document right where you are,
  // instead of the only option being to navigate to /study/$id first and
  // then tap View again there. Previewing used to always be a two-tap
  // journey from this list — this makes it one. Stores the full material
  // (not just id/path/title) so DocumentViewer can also cache it for
  // offline use on download — see DocumentViewer's `material` prop.
  const [viewerMaterial, setViewerMaterial] = useState<MaterialWithCourse | null>(null);

  return (
    <div className="min-h-screen bg-background pb-20">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="text-xs font-medium uppercase tracking-[0.2em] text-copper">Study</div>
        <h1 className="mt-2 font-display text-4xl leading-tight text-foreground sm:text-5xl">One tap: summary, flashcards, quiz.</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Upload any document — PDF, Word, PowerPoint, text, a zip of files, whatever you've got — and Learnova turns it into study tools in under a minute, then it joins the catalogue below for everyone else too.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
          <div>
            <DocumentUpload />

            <div className="mt-8 flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-2.5">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search the catalogue…"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>

            {profile?.programme_code && (
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {showAll ? "Showing every programme" : <>Curated for <span className="font-semibold text-copper">{profile.programme_code}</span></>}
                </span>
                <button onClick={() => setShowAll(!showAll)} className="rounded-full border border-border px-3 py-1 font-semibold text-foreground hover:bg-surface-muted">
                  {showAll ? "Show my programme only" : "Show all programmes"}
                </button>
              </div>
            )}

            <div className="mt-4 grid gap-3">
              {isLoading ? (
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
              ) : materials?.length ? (
                materials.map((m, idx) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, delay: Math.min(idx * 0.035, 0.4) }}
                    className="group card-hover flex items-center gap-4 rounded-2xl border border-border bg-card p-4 hover:border-primary/30 hover:shadow-soft"
                  >
                    <Link to="/study/$id" params={{ id: m.id }} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <FileText className="h-5 w-5" />
                    </Link>
                    <Link to="/study/$id" params={{ id: m.id }} className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-foreground">{m.title}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {m.courses?.code ?? "General"} · {statusLabel(m.status)}
                        {m.uploader?.full_name ? <> · <span className="text-copper">by {m.uploader.full_name}</span></> : null}
                      </div>
                    </Link>
                    {m.file_path && (
                      <button
                        onClick={() => setViewerMaterial(m)}
                        aria-label={`Preview ${m.title}`}
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-surface text-foreground hover:bg-primary hover:text-primary-foreground"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    )}
                  </motion.div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-surface-muted p-10 text-center text-sm text-muted-foreground">
                  Nothing here yet — be the first to upload something.
                </div>
              )}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="text-xs font-semibold uppercase tracking-wide text-copper">Can't find it?</div>
              <p className="mt-2 text-sm text-muted-foreground">Tell us what's missing and we'll add it.</p>
              <div className="mt-3"><RequestMaterialForm /></div>
            </div>
          </aside>
        </div>
      </div>

      <DocumentViewer
        open={!!viewerMaterial}
        onClose={() => setViewerMaterial(null)}
        materialId={viewerMaterial?.id ?? ""}
        filePath={viewerMaterial?.file_path ?? null}
        title={viewerMaterial?.title ?? ""}
        material={viewerMaterial}
      />

      <SiteFooter />
      <MobileTabBar />
    </div>
  );
        }
