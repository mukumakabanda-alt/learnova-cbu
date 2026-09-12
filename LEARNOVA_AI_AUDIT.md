# Learnova AI Codebase Audit and Transformation Roadmap

## Executive assessment

The codebase is **not empty or irredeemably weak**. It has a credible product shell, a useful document-ingestion path, Supabase security work, offline support, per-stage failure handling, and an initial distinction between standard notes, past papers, outlines, and assignments. Those are valuable foundations.

However, your concern is justified. The current system is closer to a **document-to-content generator with heuristics and a YouTube search recommender** than to a deeply reliable educational intelligence platform. The code often uses ambitious names such as “Trillion Edition,” “reasoning engine,” “knowledge graph,” and “adaptive learning,” while the implemented behavior is frequently deterministic keyword extraction, sentence ranking, fixed thresholds, local storage, or unverified model output. That gap between naming and measurable capability is the primary strategic weakness.

The path to a dramatically better product is not to add more AI modules. It is to build a **grounded learning engine** around four primitives: a high-fidelity document representation, evidence-linked generation, a learner model based on observed performance, and an evaluation system that continuously measures correctness and learning outcomes.

## Scorecard

| Area                   | Current assessment | Main reason                                                                                                                                    | Priority |
| ---------------------- | -----------------: | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------: |
| Product foundation     |               6/10 | Coherent React/Supabase app, authentication, storage, offline flow, useful UX patterns                                                         | Maintain |
| Document extraction    |               5/10 | Good format coverage and OCR fallback, but browser-heavy, capped, weak layout/math/figure fidelity                                             |       P0 |
| Document AI generation |               4/10 | Independent stages and retries are good, but prompts are generic and grounding confidence is synthetic                                         |       P0 |
| YouTube AI             |             2.5/10 | Mainly query construction, YouTube API search, title/channel substring scoring; no transcript or pedagogical evaluation                        |       P0 |
| Study tools            |             3.5/10 | Summary, flashcards, and quiz exist, but quiz validity and instructional quality are not measured                                              |       P0 |
| Personalization        |             2.5/10 | Useful first-pass data structures, but mostly localStorage and simple EMA/rules rather than a robust learner model                             |       P1 |
| Engineering quality    |               5/10 | Strong comments and recent reliability fixes, but no visible automated tests, no CI, large single-purpose files, and schema/runtime drift risk |       P0 |
| Production readiness   |             3.5/10 | Roadmap itself still lists deployment and verification as incomplete; AI pipeline depends on external secrets and edge runtime limits          |       P0 |

## What is already good

The best engineering decisions are the ones that reduce obvious failure modes. `process-material` separates summary, flashcards, quiz, and type-specific kits into independent stages. It retries transient gateway failures and persists stage status instead of making one malformed response destroy every output. It also contains an injection guard, rate limiting, permission checks, and a stale-processing cleanup job.

The upload path handles several file types, attempts page-level OCR only where native text is missing, records extraction confidence, moves heavy local work into a Web Worker, and preserves the original file when study-tool generation fails. The UI also provides honest states such as `catalog_only`, `processing`, and `failed`, which is better than presenting a blank or falsely complete result.

The material-type branching is directionally correct. A past paper should not be treated as ordinary lecture notes, and an assignment brief should not automatically become a generic multiple-choice quiz. This is the right product instinct.

## The central weakness: generated content is not verifiably grounded

The edge function asks a model to produce summaries, cards, quizzes, and kits from a text block. The normalization layer checks shape, non-empty strings, and option counts. It does not verify that an answer is entailed by a specific source passage, that a quiz explanation supports the keyed option, or that a generated question tests an important concept rather than a peripheral sentence.

The reported `groundingConfidence` is not an evaluation of grounding. It is a formula based on extraction confidence and the number of stages that succeeded. A successful model call therefore increases the score even when the output is wrong. This is a serious trust problem because the field sounds like a measured quality signal.

The long-document path is also lossy. Documents above the direct-pass limit are chunk-condensed, capped at a maximum number of chunks, and then generated from the condensed result. The system reports approximate coverage, which is good, but it does not build a page-aware retrieval index or guarantee that important sections, formulas, tables, and questions survive condensation.

## Document AI: how to make it dramatically better

### 1. Replace plain text as the primary representation

Create a canonical, page-aware document model with stable block IDs. Each block should retain page or slide number, bounding box when available, reading order, block type, extraction method, confidence, and a normalized text representation. Preserve tables as structured cells, formulas as LaTeX plus original image crop, figures as image references plus captions, and exam questions as hierarchical question trees.

The existing `AcademicDocumentModel` is a good beginning, but it currently classifies lines with regular expressions. That is not enough for multi-column PDFs, scanned notes, complex tables, handwritten annotations, or mathematics. Treat the current model as version 1 of a real intermediate representation, not as the final intelligence layer.

### 2. Move heavy extraction to a server-side asynchronous pipeline

Browser OCR is useful as a fallback, but it should not be the authoritative production path. A robust pipeline should upload the file, create a processing job, extract pages asynchronously, retry individual pages, and store page-level artifacts. The browser should show progress and allow the student to leave the page.

The pipeline should include: file validation, malware and archive limits, native text extraction, layout reconstruction, OCR, table extraction, formula recognition, figure detection, language detection, deduplication, and coverage diagnostics. Every generated artifact should reference the source block IDs that support it.

### 3. Use retrieval and map-reduce generation

For a large document, do not send one condensed text to every generator. Build a searchable chunk store with embeddings or another semantic index, plus lexical retrieval. Generate a document map first: topics, sections, concepts, formulas, questions, prerequisites, and importance. Then retrieve the relevant evidence separately for each task.

A summary should retrieve representative sections across the document. A flashcard about a formula should retrieve the formula, its definition, variables, and worked context. A quiz question should retrieve evidence plus nearby context. This reduces both omission and hallucination.

### 4. Make generation schemas strict and evidence-first

Each generated object should contain at least:

| Field              | Purpose                                                                   |
| ------------------ | ------------------------------------------------------------------------- |
| `source_block_ids` | Exact page/section evidence supporting the item                           |
| `answer_evidence`  | Short quoted or structured evidence span                                  |
| `confidence`       | Model or verifier confidence, not a success-count proxy                   |
| `difficulty`       | Difficulty with an explanation of the cognitive operation required        |
| `skill`            | Definition, application, calculation, comparison, diagnosis, or synthesis |
| `requires_figure`  | Whether the question depends on an image, table, or formula               |
| `quality_flags`    | Ambiguous, duplicate, incomplete, OCR-risk, or unsupported                |

Reject or quarantine items without usable evidence. Do not publish a study pack merely because JSON parsing succeeded.

### 5. Add a verifier and contradiction pass

Every summary claim, card answer, and quiz key should pass a second-stage verifier. The verifier should answer: Is the claim supported by the cited evidence? Is the answer complete? Is the keyed option uniquely correct? Does the explanation actually justify the key? Is the source text too ambiguous or OCR-damaged?

Use deterministic checks where possible. For example, check that a quiz key matches one option exactly, that numerical answers preserve units, that formulas parse, and that cited block IDs exist. Use a second model only for semantic entailment and ambiguity detection.

### 6. Treat document confidence as coverage, not truth

Separate these metrics:

- **Extraction quality:** how accurately text and layout were recovered.
- **Coverage:** what percentage of pages and blocks were processed.
- **Grounding:** whether an output is supported by source evidence.
- **Pedagogical quality:** whether the output helps learning.
- **Freshness:** whether the material is current where that matters.

Do not combine them into one opaque number. Display a short explanation to students and use thresholds to decide whether an item is publishable.

## YouTube AI: why the current version is weak

The current YouTube system is not really video intelligence. It builds one query from course metadata, tags, a summary, or locally extracted topics. The edge function calls YouTube Search and re-ranks up to ten results by substring matches in title and channel. That can find something related, but it cannot determine whether a video teaches the concept correctly, matches the student's level, covers the relevant subtopic, or contains an accessible explanation.

The largest problem is that the system recommends **search results**, not verified learning resources. A popular video can be topically similar and educationally poor. A strong video can be rejected because the title does not repeat the exact query terms.

### The stronger YouTube architecture

1. **Create a concept brief from the document.** Extract the exact concepts, prerequisite concepts, equations, misconceptions, expected level, language, and learning objective.
2. **Generate multiple search strategies.** Search for conceptual explanation, worked example, visual demonstration, exam solution, beginner explanation, and advanced treatment where relevant.
3. **Retrieve a larger candidate pool.** Use the YouTube API, not just one query. Cache results and respect quota limits.
4. **Fetch metadata and transcripts where permitted.** Use title, description, duration, channel, captions, chapters, language, publication date, and transcript text. Do not claim transcript-based quality when the transcript is unavailable.
5. **Score teaching fit.** Evaluate concept coverage, evidence of worked examples, prerequisite fit, pacing, language, recency, source credibility, accessibility, and likely mismatch. Penalize clickbait and unsupported claims.
6. **Return reasons with timestamps.** A recommendation should say what concept it covers and, when transcript or chapter data supports it, where the student should start.
7. **Collect feedback.** Track open, watch duration when available, save, dismiss, “not relevant,” and quiz improvement after watching. Use this to improve ranking.

A good product experience would show three clearly different recommendations: **learn the idea**, **watch a worked example**, and **review for the exam**. It should also explain why each video was selected and label uncertainty when transcript or quality evidence is missing.

## Study tools: how to turn outputs into actual learning

### Summaries

The local summarizer is TextRank-like sentence extraction with academic signal boosts. That is a reasonable offline fallback, but it is extractive and cannot reliably explain relationships, preserve argument structure, or adapt to a student's goal. The cloud prompt asks for a 150–250 word summary but does not require claims to cite source blocks.

Replace the single summary with layered views: a three-sentence orientation, a structured outline, key ideas with evidence, formulas and variable meanings, common misconceptions, prerequisites, worked examples, and an “ask this document” mode. Let the learner choose “quick revision,” “deep understanding,” “exam preparation,” or “beginner explanation.”

### Flashcards

The current flashcards are mostly question-and-answer pairs. They need richer types and scheduling. Add cloze deletion, conceptual comparison, formula-with-variable prompts, image occlusion for diagrams, procedural steps, and misconception cards. Each card should have a source citation, skill label, difficulty, and quality status.

Use a real spaced-repetition scheduler such as an FSRS-style model or a carefully implemented Leitner baseline. Record response confidence, response time, hint usage, and whether the learner answered before revealing the solution. Do not infer mastery from quiz percentage alone.

### Quizzes

The current quiz prompt requests plausible distractors, but the code does not verify distractor validity or uniqueness of the correct answer. The local fallback contains generic filler distractors, which makes it unsuitable as a trustworthy educational assessment. The UI also appears to store weak questions as strings rather than linking errors to specific concepts and evidence.

Build an item bank with item metadata, source citations, cognitive skill, misconception targeted, difficulty calibration, and exposure history. Include multiple-choice, short answer, numerical response, ordering, matching, diagram labeling, and “explain your reasoning” items. For each item, validate that only one answer is correct, explanations are consistent, and distractors correspond to realistic misconceptions.

### Feedback and remediation

A wrong answer should not merely reveal the correct option. It should identify the likely misconception, show the smallest supporting explanation, give a hint, and offer one follow-up item at the right level. The system should branch: prerequisite repair, another example, targeted practice, or advancement.

The central learner loop should be:

> attempt → diagnose → explain → practice → re-test → schedule review

This is much more valuable than generating more content tabs.

## Personalization: where the current model overclaims

The local student-memory engine has useful types and sensible first-pass ideas, but it is largely a hand-written rules engine backed by localStorage. The mastery estimate is an exponential moving average of scores. It does not model item difficulty, guessing, forgetting, confidence, response time, or evidence quality. Recommendations match tags to materials and use fixed thresholds.

Start by moving learning events to a server-side event model with privacy controls. Store attempts, item IDs, concepts, answer correctness, confidence, time, hints, and source pack version. Then implement a transparent baseline model: per-concept mastery, decay since review, item difficulty, and uncertainty. Later, use Bayesian knowledge tracing or another validated learner model when enough data exists.

Do not call a topic “mastered” after two attempts. Show uncertainty and use language such as “currently performing well on the observed items.”

## Engineering and reliability priorities

The repository contains approximately 24,000 lines across source and edge-function code, but the visible test footprint is effectively absent. That is a larger concern than the number of features. The AI pipeline has many important correctness boundaries that need automated tests.

Add these immediately:

| Test layer        | Minimum coverage                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Unit tests        | OCR confidence, document classification, chunk coverage, JSON normalization, quiz index handling, formula parsing, scheduler behavior |
| Property tests    | Any generated quiz has a valid key; options are non-empty and distinct; cited blocks exist; scores stay in bounds                     |
| Golden fixtures   | Clean PDF, scanned PDF, mixed PDF, multi-column notes, tables, formulas, past paper, outline, assignment, multilingual document       |
| Integration tests | Upload-to-processing state machine, retries, partial stage failure, permission checks, admin regeneration, stale job expiration       |
| Evaluation set    | Human-labeled summary claims, flashcard quality, quiz correctness, YouTube relevance, OCR accuracy                                    |
| Browser tests     | Upload, progress, failed stage, regeneration, offline bundle, quiz attempt, mobile layout                                             |

Add CI for typecheck, lint, tests, build, migration checks, and security rules. Treat `roadmap.md` items for deployment and supplied-file verification as release blockers, not optional cleanup.

The current edge function also has a dangerous failure shape: the outer catch marks all stages failed even after one stage may already have succeeded. The per-stage writes are helpful, but the final catch should preserve successful stage states and only mark the unresolved stage or job as failed. Similarly, publishing a canonical pack should be transactional or protected against concurrent runs; otherwise two workers can race while flipping `is_current`.

## Recommended target architecture

```text
Upload
  ↓
Job record + immutable source file
  ↓
Asynchronous extraction pipeline
  ├─ native text / OCR
  ├─ layout and reading order
  ├─ tables / formulas / figures
  └─ page-level quality and coverage
  ↓
Canonical document graph
  ├─ blocks and citations
  ├─ concepts and prerequisites
  ├─ questions and formulas
  └─ semantic + lexical retrieval index
  ↓
Task-specific generation
  ├─ summary
  ├─ flashcards
  ├─ quiz items
  ├─ study kits
  └─ video concept brief
  ↓
Verification and quality gates
  ├─ schema validation
  ├─ evidence entailment
  ├─ numerical/formula checks
  ├─ duplicate and ambiguity checks
  └─ pedagogical scoring
  ↓
Versioned study pack
  ├─ evidence-linked outputs
  ├─ confidence and quality flags
  └─ reproducible model/prompt metadata
  ↓
Learner loop
  ├─ attempts and feedback
  ├─ mastery and uncertainty
  ├─ spaced repetition
  ├─ remediation
  └─ measured outcomes
```

## 90-day execution plan

### Days 0–14: establish trust

Freeze feature expansion. Add CI, unit tests, representative fixtures, structured logs, job IDs, prompt/model version recording, and an evaluation dataset. Fix the synthetic grounding score. Make every published output show source evidence internally, even if the first UI only displays a “based on page X” label.

### Days 15–35: rebuild document intelligence

Version the document model. Store page/block artifacts. Improve layout and table handling. Move OCR and long-document processing into asynchronous jobs. Replace blind condensation with retrieval-aware generation. Add formula and figure pathways with explicit “not understood” states.

### Days 36–55: rebuild study generation

Generate evidence-linked summaries, cards, and quiz items. Add a verifier pass and quality gates. Remove generic filler distractors. Introduce item types that match university learning: worked calculation, comparison, misconception diagnosis, short answer, and structured response.

### Days 56–70: build the learner loop

Move events server-side. Implement a transparent mastery and forgetting baseline. Add hints, remediation, confidence capture, response time, and spaced review. Make recommendations explainable and tied to observed evidence.

### Days 71–85: upgrade YouTube intelligence

Implement candidate retrieval, metadata/transcript enrichment where allowed, concept coverage scoring, educational-fit ranking, timestamped reasons, caching, and feedback signals. Present fewer but better videos.

### Days 86–90: validate with real students

Run a controlled evaluation with representative Learnova documents and students. Measure extraction coverage, citation support, answer correctness, quiz item validity, time-to-first-useful-output, study completion, delayed retention, and video relevance. Do not claim success from feature count.

## Metrics that should define “better”

| Metric                                       | Target direction |
| -------------------------------------------- | ---------------- |
| Source-supported summary claims              | Up               |
| Quiz key correctness and unique-answer rate  | Up toward 100%   |
| Unsupported generated items                  | Down toward zero |
| Important-section coverage in long documents | Up               |
| OCR word error rate                          | Down             |
| Time to first usable study tool              | Down             |
| Regeneration rate due to poor quality        | Down             |
| Student “not relevant” video dismissals      | Down             |
| Practice-to-retest improvement               | Up               |
| Delayed retention after 7 days               | Up               |
| Percentage of outputs with usable citations  | Up toward 100%   |

## Bottom line

Learnova does not need a larger pile of named AI modules. It needs a smaller number of **trustworthy, measurable intelligence primitives**. The fastest route to a product that feels dramatically better is:

1. **Make every output evidence-linked and verifiable.**
2. **Make long documents page-aware and retrieval-based.**
3. **Turn YouTube from search-result matching into transcript- and concept-aware resource ranking.**
4. **Turn quizzes and flashcards into a closed learning loop with remediation and spacing.**
5. **Move student memory from local rules into an observable, privacy-aware learner model.**
6. **Create automated evaluation before adding more features.**

If these priorities are executed well, the result will not merely look more advanced. It will be measurably more accurate, more useful for exam preparation, more personalized, and more trustworthy to students and educators.

## References

[1]: https://github.com/mukumakabanda-alt/learnova-cbu "Learnova CBU repository"
[2]: https://github.com/mukumakabanda-alt/learnova-cbu/blob/main/supabase/functions/process-material/index.ts "Learnova material processing pipeline"
[3]: https://github.com/mukumakabanda-alt/learnova-cbu/blob/main/supabase/functions/youtube-recommendations/index.ts "Learnova YouTube recommendations function"
[4]: https://github.com/mukumakabanda-alt/learnova-cbu/blob/main/src/lib/document-text.ts "Learnova document extraction pipeline"
[5]: https://github.com/mukumakabanda-alt/learnova-cbu/blob/main/src/lib/learnova-ai/student-memory.ts "Learnova student memory engine"
[6]: https://github.com/mukumakabanda-alt/learnova-cbu/blob/main/roadmap.md "Learnova Document Intelligence roadmap"

_Prepared from the repository state cloned from `origin/main` during this audit._
