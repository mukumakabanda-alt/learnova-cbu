import { Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";

type CourseCardData = {
  code: string;
  title: string;
  year: number;
  programmes?: { name: string; school: string } | null;
};

export function CourseCard({ course }: { course: CourseCardData }) {
  return (
    <Link
      to="/courses/$code"
      params={{ code: course.code.toLowerCase().replace(/\s+/g, "-") }}
      className="group card-hover block rounded-2xl border border-border bg-card p-5 hover:border-primary/30 hover:shadow-soft"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">{course.code}</span>
          <h3 className="mt-2 truncate text-base font-semibold text-foreground">{course.title}</h3>
          <p className="mt-1 truncate text-xs text-muted-foreground">{course.programmes?.name ?? "—"} · Year {course.year}</p>
        </div>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-muted text-copper"><FileText className="h-4 w-4" /></div>
      </div>
    </Link>
  );
}
