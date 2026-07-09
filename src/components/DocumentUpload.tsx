import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Upload, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { extractPdfText } from "@/lib/pdf-text";
import { useAuth } from "@/hooks/use-auth";

export function DocumentUpload({ courseCode }: { courseCode?: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (!user) {
      setError("Sign in first — it takes a minute, and it's how we credit your upload.");
      return;
    }
    if (file.type !== "application/pdf") {
      setError("PDFs only for now.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      setStage("Reading document…");
      const { text, pages } = await extractPdfText(file);
      if (text.length < 50) throw new Error("Couldn't find readable text in this PDF (is it a scan?).");

      setStage("Uploading…");
      const path = `${user.id}/${crypto.randomUUID()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("materials").upload(path, file);
      if (uploadError) throw uploadError;

      setStage("Adding to catalogue…");
      const { data: material, error: insertError } = await supabase
        .from("materials")
        .insert({
          title: file.name.replace(/\.pdf$/i, ""),
          course_code: courseCode ?? null,
          type: "Notes",
          pages,
          file_path: path,
          status: "processing",
          source: "student",
          uploaded_by: user.id,
        })
        .select()
        .single();
      if (insertError) throw insertError;

      setStage("Generating summary, flashcards & quiz…");
      const { error: fnError } = await supabase.functions.invoke("process-material", {
        body: { materialId: material.id, text, title: material.title },
      });
      if (fnError) throw fnError;

      navigate({ to: "/study/$id", params: { id: material.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong — try again.");
    } finally {
      setBusy(false);
      setStage("");
    }
  }

  return (
    <label className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${busy ? "border-primary/40 bg-primary/5" : "border-border bg-surface-muted hover:border-primary/40"}`}>
      <input
        type="file"
        accept="application/pdf"
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      {busy ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Upload className="h-6 w-6 text-copper" />}
      <div className="text-sm font-semibold text-foreground">{busy ? stage : "Upload a PDF"}</div>
      <p className="max-w-xs text-xs text-muted-foreground">
        {busy ? "This can take a moment — don't close the tab." : "It gets a summary, flashcards and a quiz automatically, then joins the catalogue for everyone."}
      </p>
      {error && <p className="mt-1 text-xs font-medium text-destructive">{error}</p>}
    </label>
  );
}
