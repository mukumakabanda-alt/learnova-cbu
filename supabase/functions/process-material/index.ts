// Called from the client right after a material's raw text has been
// extracted (see src/lib/pdf-text.ts) and the row exists with status
// 'processing'. This function never receives the raw PDF — only text —
// so it has nothing to do with parsing PDFs, which keeps it simple and
// keeps this the one thing likely to actually need a version bump later:
// the model string below.
//
// Env vars used (all auto-provided once Lovable Cloud is enabled on this
// project — nothing to configure by hand):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LOVABLE_API_KEY

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Check Cloud → AI in the Lovable editor for the current recommended
// model id if this one ever stops resolving — the gateway's model list
// does shift over time.
const MODEL = "google/gemini-2.5-flash";
const MAX_INPUT_CHARS = 40000;

type PipelineResult = {
  summary: string;
  flashcards: { question: string; answer: string }[];
  quiz: { question: string; options: string[]; correct_index: number; explanation: string }[];
};

function buildPrompt(text: string, title: string) {
  return `You are building study material for a university student from a document titled "${title}".

Return ONLY valid JSON (no markdown fences, no commentary) matching exactly this shape:
{
  "summary": string,               // 150-250 words, plain prose, covers the document's main ideas
  "flashcards": [{ "question": string, "answer": string }],   // 10-15 cards, question on front, concise answer on back
  "quiz": [{ "question": string, "options": [string, string, string, string], "correct_index": number, "explanation": string }] // 8-10 questions, correct_index is 0-based
}

Base everything only on the document text below. If the text is fragments or low quality, still do your best with what's there.

DOCUMENT TEXT:
"""
${text.slice(0, MAX_INPUT_CHARS)}
"""`;
}

function extractJson(raw: string): PipelineResult {
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
  const parsed = JSON.parse(cleaned);
  if (!parsed.summary || !Array.isArray(parsed.flashcards) || !Array.isArray(parsed.quiz)) {
    throw new Error("AI response missing required fields");
  }
  return parsed;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

  if (!supabaseUrl || !serviceRoleKey || !lovableApiKey) {
    return new Response(JSON.stringify({ error: "Missing required environment secrets" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  let materialId: string | undefined;
  try {
    const body = await req.json();
    materialId = body.materialId;
    const text: string = body.text ?? "";
    const title: string = body.title ?? "this document";

    if (!materialId || !text.trim()) {
      return new Response(JSON.stringify({ error: "materialId and text are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: buildPrompt(text, title) }],
      }),
    });

    if (!aiRes.ok) {
      throw new Error(`AI gateway error ${aiRes.status}: ${await aiRes.text()}`);
    }

    const aiJson = await aiRes.json();
    const raw = aiJson.choices?.[0]?.message?.content ?? "";
    const result = extractJson(raw);

    await admin.from("flashcards").delete().eq("material_id", materialId);
    await admin.from("quiz_questions").delete().eq("material_id", materialId);

    if (result.flashcards.length) {
      await admin.from("flashcards").insert(
        result.flashcards.map((f, i) => ({ material_id: materialId, position: i, question: f.question, answer: f.answer })),
      );
    }
    if (result.quiz.length) {
      await admin.from("quiz_questions").insert(
        result.quiz.map((q, i) => ({
          material_id: materialId, position: i, question: q.question,
          options: q.options, correct_index: q.correct_index, explanation: q.explanation ?? "",
        })),
      );
    }

    await admin.from("materials").update({ status: "ready", summary: result.summary, updated_at: new Date().toISOString() }).eq("id", materialId);

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error(error);
    if (materialId) {
      await admin.from("materials").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", materialId);
    }
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
