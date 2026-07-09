import { Link } from "@tanstack/react-router";
import { FileText, Clock } from "lucide-react";
import { courseSlug, type Course } from "@/lib/mock-data";

export function CourseCard({ course }: { course: Course }) {
  const latest = course.materials[0]?.updated;

  return (
    <Link
      to="/courses/$code"
      params={{ code: courseSlug(course) }}
      className="group card-hover block rounded-2xl border border-border bg-card p-5 hover:border-primary/30 hover:shadow-soft"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
            {course.code}
          </span>
          <h3 className="mt-2 truncate text-base font-semibold text-foreground">{course.title}</h3>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {course.programme} · Year {course.year} · Sem {course.semester}
          </p>
        </div>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-muted text-copper">
          <FileText className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          {course.materials.length} materials
        </span>
        {latest && (
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Updated {latest}
          </span>
        )}
      </div>
    </Link>
  );
          }
