# Learnova Document Intelligence V4

## Goal
Make Learnova reliably understand the supplied PDFs, scans, slides, Word files, images, Markdown, and image bundles before it generates study material. Preserve the current product structure and visual identity; change only the ingestion, generation, permissions, auth configuration, offline completeness, loading copy, and course-material organization requested.

## Implementation plan

### 1. Build a structured academic document model
- Introduce one shared model containing document type, pages/slides, headings, paragraphs, lists, tables, formulas, figures, questions, examples, learning outcomes, and extraction evidence.
- Preserve page and slide boundaries instead of passing one flattened text blob downstream.
- Keep source references on extracted facts so generated cards/questions can be validated against the document.

### 2. Replace the weak format-specific extraction paths
- **PDF:** classify each page as native-text, scan, table/formula-heavy, image-heavy, or blank; preserve page markers and reading order; OCR only pages that need it.
- **Scanned PDF and photo bundles:** initialize OCR once per upload, reuse it for every page, process pages with device-aware bounded concurrency, and terminate it once at the end.
- Add adaptive image preparation before OCR: orientation correction, sensible resizing, contrast/grayscale cleanup, and higher resolution only when the first pass is weak.
- Bundle and cache the OCR runtime/language assets with the app so a new OCR job does not depend on a third-party download and can work offline after the app is installed/cached.
- **PowerPoint:** preserve slide number, title, bullets, notes, tables, and text order; inspect slide media and OCR meaningful embedded images instead of reading only `<a:t>` strings.
- **Word:** preserve headings, lists, tables, and section boundaries rather than extracting raw text only.
- **Markdown/text/images/ZIP:** map content into the same model; report ZIP truncation/depth omissions instead of silently hiding them.

### 3. Improve OCR correction and confidence
- Run OCR cleanup and academic/context-aware correction before both the full AI path and the local fallback.
- Replace length-based confidence with combined signals: OCR confidence, page coverage, abnormal-character ratio, language consistency, repeated garbage, heading/section detection, formula/table validity, and semantic coherence.
- Store extraction confidence separately from study-pack confidence.
- If final confidence is below `0.50`, save and preview the document but do not create misleading study tools; show “Study tools aren’t available for this document yet.”
- Never use document type, filename, page count, or generic metadata as flashcard/quiz content.

### 4. Generate document-type-specific canonical study packs
- Classify before generation and produce only the appropriate pack:
  - Notes: summary, definitions, concepts, formulas, flashcards, quiz.
  - Slides: slide-aware summary, concepts, definitions, formulas, examples, flashcards, practice questions.
  - Past paper/test: extracted questions, topics tested, marks, answer guidance, revision priorities; no generic quiz stage.
  - Course outline: learning outcomes, topic map, schedule/study plan, required topics.
  - Assignment: requirements, deliverables, constraints, checklist, planning guidance.
- Send the structured model and extraction evidence to generation, not an unlabelled text blob.
- Add grounding validation so outputs unsupported by the source are rejected rather than stored.
- Build YouTube queries from course, discipline, concept, subtopic, and learning objective—not isolated keywords.

### 5. Make generation fast, progressive, and honest
- Keep extraction/upload parallel.
- Reuse OCR workers and use controlled page concurrency based on device capability; avoid unbounded parallelism on low-memory phones.
- Run independent generation stages concurrently and persist each completed stage immediately.
- Remove artificial AI request aborts; use streaming/progress-compatible calls so long reasoning does not appear idle or discard paid work.
- Target completion within four minutes for supported documents under the upload/page limits, while retaining quality and showing page/stage progress. Do not claim a universal hard guarantee on damaged, handwritten, or extremely large scans; instead expose the exact unreadable pages and prevent fabricated tools.

### 6. Canonical, versioned, admin-controlled packs
- Add versioned study-pack records with one current version per material and retained prior versions for rollback.
- Initial processing may run for the signed-in uploader after the file is saved.
- After a canonical pack exists, only an admin may regenerate or publish a new current version; enforce this in the backend, not only by hiding buttons.
- Students can save, bookmark, annotate locally, and retake quizzes without altering the canonical pack.

### 7. Complete offline study bundles
- Store the original document plus the current summary, topics, definitions, formulas, flashcards, quiz or type-specific kit, answer guidance, and video metadata in the offline bundle.
- Keep the app shell and downloaded study workspace navigable offline; clearly mark upload, remote search, regeneration, new recommendations, and new downloads as online-only.

### 8. Fix the visible workflow issues
- Replace the processing checklist with neutral “Generating study tools…” progress so a past paper never promises a quiz.
- Show type-appropriate finished labels everywhere.
- Group each course’s materials under Notes, Slides, Past Papers, Course Outlines, Assignments, and Other instead of one growing flat list.
- Preserve existing Home, Browse, Study, Offline, Dashboard, Admin, header, and bottom navigation structure.

### 9. Fix student authentication configuration
- Keep the student form as name, student number, programme, year, and password only.
- Keep the stable internal identifier required by managed authentication invisible to students.
- Enable password authentication and immediate confirmation in Lovable Cloud so synthetic student accounts can sign up and sign in without email verification.
- Preserve the separate admin email/password and Google flow; do not create another initial admin.

## Backend and technical changes
- Add migrations for structured extraction metadata and versioned canonical study packs, with grants, RLS, admin-only regeneration/publication, and uploader-only initial processing.
- Update generated database types after migration.
- Extend the processing request with document model, extraction confidence, and evidence; validate request shape and ownership.
- Keep secrets private and use existing managed AI/storage/auth services.
- Update service-worker precaching for OCR assets and verify cache version upgrades do not strand older phones.

## Verification and acceptance tests
- Parse all four supplied PDFs and compare extracted headings, questions, formulas, tables, slide boundaries, and page coverage against their actual contents.
- Specifically verify:
  - the 5-page BEC 242 test yields its ten questions and probability/statistics topics, not a generic quiz;
  - the 140-page BEC 210 deck preserves slide topics and formulas across the deck;
  - the 8-page IT notes preserve sections, definitions, lists, and the processing-cycle table;
  - the 7-page eigenvalues notes preserve equations, worked examples, and the final exercise.
- Test representative phone images and a combined image bundle, confirming one OCR initialization and materially lower elapsed time.
- Test PPTX with embedded images/tables, DOCX headings/tables, Markdown, native PDF, scanned PDF, ZIP bundle, and corrupt/low-confidence input.
- Verify under-50% confidence creates no fabricated pack.
- Verify initial uploader processing succeeds, student regeneration is denied, admin regeneration creates a new version, and rollback restores the previous version.
- Verify student signup/sign-in on a fresh account, existing admin email login, programme/year curation, grouped course materials, online preview/download, and a fully downloaded offline study session.
- Measure extraction and generation durations and report actual timings and any document/device class that cannot meet the four-minute target.
