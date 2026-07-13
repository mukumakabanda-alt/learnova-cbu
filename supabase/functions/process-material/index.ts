// Called from the client right after a material's raw text has been
// extracted (see src/lib/document-text.ts, which handles PDF, Word,
// PowerPoint, plain text and zip bundles) and the row exists with status
// 'processing'. This function never receives the raw file — only text —
// so it has nothing to do with parsing file formats, which keeps it
// simple and keeps this the one thing likely to actually need a version
// bump later: the model string below.
//
// Env vars used (all auto-provided once Lovable Cloud is enabled on this
// project — nothing to configure by hand):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, LOVABLE_API_KEY
//
// Security model (see supabase/migrations/0002_security_and_reliability_fixes.sql
// for the matching pipeline_invocations table):
//   1. The caller's own JWT (forwarded automatically by supabase.functions.invoke)
//      is used to identify who is calling — never trusted purely from the body.
//   2. The service-role client is used only to answer "who owns this material"
//      and to perform the writes the pipeline itself needs — never to decide
//      whether the caller is allowed to act.
//   3. A material can only be (re)processed while it is genuinely awaiting
//      processing, by its owner or an admin, and only a bounded number of
//      times per user in a rolling window.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Check Cloud → AI in the Lovable editor for the current recommended
// model id if this one ever stops resolving — the gateway's model list
// does shift over time.
const MODEL = "google/gemini-2.5-flash";
const MAX_INPUT_CHARS = 60000;

// Abuse guard: at most this many pipeline runs per user in the rolling
// window below. Tune once real usage patterns are known.
const RATE_LIMIT_MAX_CALLS = 5;
const RATE_LIMIT_WINDOW_MINUTES = 10;

type PipelineResult = {
  summary: string;
  flashcards: { question: string; answer: string }[];
  quiz: { question: string; options: string[]; correct_index: number; explanation: string }[];
  tags: string[];
  detected_year: number | null;
};

function safeDbText(value: unknown, fallback = ""): string {
  return String(value ?? fallback)
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/[\uD800-\uDFFF]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function normalizeResult(result: PipelineResult): PipelineResult {
  return {
    summary: safeDbText(result.summary),
    flashcards: result.flashcards
      .map((card) => ({ question: safeDbText(card.question), answer: safeDbText(card.answer) }))
      .filter((card) => card.question && card.answer)
      .slice(0, 20),
    quiz: result.quiz
      .map((question) => ({
        question: safeDbText(question.question),
        options: question.options.map((option) => safeDbText(option)).filter(Boolean).slice(0, 4),
        correct_index: Number.isInteger(question.correct_index) ? Math.max(0, Math.min(3, question.correct_index)) : 0,
        explanation: safeDbText(question.explanation),
      }))
      .filter((question) => question.question && question.options.length >= 2)
      .slice(0, 12),
    tags: result.tags.map((tag) => safeDbText(tag)).filter(Boolean).slice(0, 8),
    detected_year: result.detected_year,
  };
}

function buildPrompt(text: string, title: string, materialType: string) {
  const isPastPaper = materialType.toLowerCase() === "past paper";
  const safeTitle = safeDbText(title, "this document");
  const safeMaterialType = safeDbText(materialType, "Notes");
  const safeText = safeDbText(text);
  return `You are building study material for a university student from a document titled "${safeTitle}" (catalogued as: ${safeMaterialType}).

Return ONLY valid JSON (no markdown fences, no commentary) matching exactly this shape:
{
  "summary": string,               // 150-250 words, plain prose, covers the document's main ideas
  "flashcards": [{ "question": string, "answer": string }],   // 10-15 cards, question on front, concise answer on back
  "quiz": [{ "question": string, "options": [string, string, string, string], "correct_index": number, "explanation": string }], // 8-10 questions, correct_index is 0-based
  "tags": [string],                // 4-8 short topic/theme tags (2-4 words each) actually covered in the text — used to recommend related material
  "detected_year": number | null   // the calendar year this document is FROM, ONLY if it's stated plainly in the text (e.g. an exam header like "MAY 2019"). null if not stated or unclear — never guess.
}
${isPastPaper ? `\nThis is a past exam paper. Weight the flashcards and quiz toward the recurring themes and question styles actually present in the text — the goal is to help a student recognise what this course tends to ask, not just recall isolated facts.\n` : ""}
Base everything only on the document text below. If the text is fragments or low quality, still do your best with what's there.

DOCUMENT TEXT:
"""
${safeText.slice(0, MAX_INPUT_CHARS)}
"""`;
}

function extractJson(raw: string): PipelineResult {
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Salvage attempt: the model occasionally wraps valid JSON in a
    // sentence or two of commentary despite instructions. Grab the
    // outermost { ... } span and try again before giving up entirely.
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) throw new Error("AI response was not valid JSON");
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  }
  if (!parsed.summary || !Array.isArray(parsed.flashcards) || !Array.isArray(parsed.quiz)) {
    throw new Error("AI response missing required fields");
  }
  const tags = Array.isArray(parsed.tags) ? parsed.tags.filter((t: unknown) => typeof t === "string").slice(0, 8) : [];
  const detectedYear =
    typeof parsed.detected_year === "number" && parsed.detected_year >= 1990 && parsed.detected_year <= 2100
      ? Math.round(parsed.detected_year)
      : null;
  return normalizeResult({ ...parsed, tags, detected_year: detectedYear });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

  // Service-role client: bypasses RLS. Used ONLY for reads that answer
  // ownership questions definitively, and for the pipeline's own writes.
  // Created eagerly (once we at least have the two Supabase secrets) so
  // that if the AI key specifically is what's missing, we can still write
  // a clear reason onto the material row below instead of just 500-ing
  // into the void — that clear reason is what turns "I don't know if this
  // is working" into "oh, I just need to add LOVABLE_API_KEY."
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: "Missing required Supabase environment secrets" }, 500);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // User-scoped client: carries the caller's own JWT (supabase.functions.invoke
  // forwards the Authorization header automatically), so auth.getUser() tells
  // us who is really calling — never trust materialId/text alone for that.
  const authHeader = req.headers.get("Authorization") ?? "";
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await callerClient.auth.getUser();
  const callerId = userData?.user?.id;
  if (userError || !callerId) {
    return jsonResponse({ error: "Sign in required." }, 401);
  }

  let materialId: string | undefined;
  try {
    const body = await req.json();
    materialId = body.materialId;
    const text: string = safeDbText(body.text ?? "");
    const title: string = safeDbText(body.title ?? "this document", "this document");

    if (!materialId || !text.trim()) {
      return jsonResponse({ error: "materialId and text are required" }, 400);
    }

    // Now that we know which material this is, a missing AI key can be
    // recorded as a clear, actionable reason on the row itself rather than
    // just failing silently — see the catch block below, which this
    // deliberately funnels into by throwing here instead of returning.
    if (!lovableApiKey) {
      throw new Error(
        "AI generation isn't configured yet: the LOVABLE_API_KEY secret is missing. Add it in Supabase → Project Settings → Edge Functions → Secrets (or Lovable Cloud → Backend → Secrets), then re-upload or ask an admin to reprocess this file.",
      );
    }

    // Ownership + state check. Done explicitly in code rather than relying
    // on row visibility as a proxy for permission — "ready"/"catalog_only"
    // materials are visible to everyone by design, which is not the same
    // thing as being allowed to reprocess them.
    const { data: material, error: materialError } = await admin
      .from("materials")
      .select("id, uploaded_by, status, type, content_year")
      .eq("id", materialId)
      .maybeSingle();
    if (materialError) throw materialError;
    if (!material) return jsonResponse({ error: "Material not found." }, 404);

    const { data: callerAdminRole, error: roleError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleError) throw roleError;
    const callerIsAdmin = callerAdminRole?.role === "admin";

    if (material.uploaded_by !== callerId && !callerIsAdmin) {
      return jsonResponse({ error: "You don't have permission to process this material." }, 403);
    }
    if (material.status !== "processing") {
      return jsonResponse({ error: "This material isn't awaiting processing." }, 409);
    }

    // Rate limit: count this caller's pipeline runs in the trailing window.
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();
    const { count, error: countError } = await admin
      .from("pipeline_invocations")
      .select("*", { count: "exact", head: true })
      .eq("user_id", callerId)
      .gte("created_at", windowStart);
    if (countError) throw countError;

    if ((count ?? 0) >= RATE_LIMIT_MAX_CALLS) {
      return jsonResponse(
        { error: `Too many requests — try again in a few minutes (limit: ${RATE_LIMIT_MAX_CALLS} per ${RATE_LIMIT_WINDOW_MINUTES} min).` },
        429,
      );
    }

    // Record this invocation before calling the AI gateway, so two requests
    // racing each other still both count toward the limit.
    await admin.from("pipeline_invocations").insert({ user_id: callerId, material_id: materialId });

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": lovableApiKey,
        "X-Lovable-AIG-SDK": "learnova-edge-fetch",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: buildPrompt(text, title, material.type ?? "Notes") }],
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

    await admin
      .from("materials")
      .update({
        status: "ready",
        summary: result.summary,
        tags: result.tags,
        processing_error: null,
        // Only fill content_year if it's currently unset — never overwrite
        // a year the uploader (or an admin) deliberately entered.
        ...(material.content_year == null && result.detected_year != null ? { content_year: result.detected_year } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", materialId);

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error(error);
    const message = safeDbText(error instanceof Error ? error.message : "Unknown error", "Unknown error");
    if (materialId) {
      // Written even though `admin` requires supabaseUrl/serviceRoleKey to
      // exist — both are guaranteed by this point, since we return early
      // above whenever either is missing, before materialId is ever read.
      await admin
        .from("materials")
        .update({ status: "failed", processing_error: message, updated_at: new Date().toISOString() })
        .eq("id", materialId);
    }
    return jsonResponse({ error: message }, 500);
  }
});
