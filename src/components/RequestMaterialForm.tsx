import { useState } from "react";
import { Plus, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCreateRequest } from "@/lib/queries";

export function RequestMaterialForm({ defaultCourseCode }: { defaultCourseCode?: string }) {
  const { user } = useAuth();
  const createRequest = useCreateRequest();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");

  if (createRequest.isSuccess) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-teal/30 bg-teal/10 p-3 text-sm text-foreground">
        <CheckCircle2 className="h-4 w-4 text-teal" /> Sent — we'll notify you when it's added.
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!user || !title.trim()) return;
        createRequest.mutate({ title: title.trim(), notes, courseCode: defaultCourseCode ?? null, requestedBy: user.id });
      }}
      className="space-y-2"
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder='What&apos;s missing? e.g. "EE 340 2023 past paper"'
        className="w-full rounded-xl border border-input bg-surface px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
      />
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Any extra detail (optional)"
        rows={2}
        className="w-full rounded-xl border border-input bg-surface px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
      />
      {!user ? (
        <p className="text-xs text-muted-foreground">Sign in to send a request.</p>
      ) : (
        <button
          type="submit"
          disabled={!title.trim() || createRequest.isPending}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> {createRequest.isPending ? "Sending…" : "Send request"}
        </button>
      )}
    </form>
  );
}
