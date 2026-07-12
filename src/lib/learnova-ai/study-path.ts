// ═══════════════════════════════════════════════════════════════════
// Learnova AI v2 — Study Path Generator & Progression Planner
// Creates personalized learning paths through document content,
// identifies prerequisites, and plans progressive difficulty levels.
// No external APIs. Pure TypeScript.
// ═══════════════════════════════════════════════════════════════════

import { splitSentences, tokenizeContent, termFrequency, stem } from "./tokenizer";
import { extractKeywords, extractKeyTopics } from "./keyword-extractor";
import { assessDifficulty } from "./structure-analyzer";
import { extractEntities } from "./entity-extractor";
import { buildKnowledgeGraph } from "./knowledge-graph";
import type { StudyPathNode, ProgressionPlan, ProgressionLevel, GlossaryEntry } from "./types";

/**
 * Generate a study path through a document's content.
 * Orders topics by prerequisite relationships and difficulty.
 */
export function generateStudyPath(text: string): StudyPathNode[] {
  if (!text || text.trim().length < 50) return [];

  const topics = extractKeyTopics(text, 10);
  const keywords = extractKeywords(text, 20);
  const difficulty = assessDifficulty(text);
  const graph = buildKnowledgeGraph(text);
  const sentences = splitSentences(text);

  const path: StudyPathNode[] = [];
  let position = 0;

  // 1. Review node — what you should know before starting
  const prerequisiteTopics = identifyPrerequisites(text, topics);
  if (prerequisiteTopics.length > 0) {
    path.push({
      id: `sp_${position++}`,
      title: "Review: Prerequisites",
      type: "review",
      description: `Before diving in, make sure you understand: ${prerequisiteTopics.join(", ")}. These concepts are assumed knowledge for this document.`,
      estimatedTime: 15,
      prerequisites: [],
      difficulty: "easy",
    });
  }

  // 2. Learn nodes — one per major topic, ordered by dependency
  const orderedTopics = orderTopicsByDependency(topics, graph);

  for (const topic of orderedTopics) {
    // Find the most relevant sentence for this topic
    const relevantSentence = sentences.find((s) =>
      s.toLowerCase().includes(topic.toLowerCase().split(/\s+/)[0]),
    );

    // Determine difficulty based on position (earlier = easier)
    const topicDifficulty: StudyPathNode["difficulty"] =
      position <= 2 ? "easy" : position <= 5 ? "medium" : "hard";

    path.push({
      id: `sp_${position++}`,
      title: `Learn: ${topic}`,
      type: "learn",
      description: relevantSentence
        ? relevantSentence.slice(0, 200)
        : `Study the concept of ${topic} as covered in this document.`,
      estimatedTime: 20,
      prerequisites: orderedTopics
        .slice(0, Math.max(0, position - 3))
        .slice(-2),
      difficulty: topicDifficulty,
    });
  }

  // 3. Practice node — flashcards and self-testing
  if (keywords.length > 0) {
    path.push({
      id: `sp_${position++}`,
      title: "Practice: Key Terms & Definitions",
      type: "practice",
      description: `Test yourself on the ${keywords.length} key terms identified in this document. Focus on: ${keywords.slice(0, 5).join(", ")}.`,
      estimatedTime: 15,
      prerequisites: orderedTopics.slice(0, 3),
      difficulty: "medium",
    });
  }

  // 4. Test node — quiz and assessment
  path.push({
    id: `sp_${position++}`,
    title: "Test: Comprehension Check",
    type: "test",
    description: `Take the auto-generated quiz to verify your understanding. The quiz covers all major topics with ${difficulty.level} difficulty level questions.`,
    estimatedTime: 20,
    prerequisites: orderedTopics,
    difficulty: difficulty.level === "beginner" ? "easy" : difficulty.level === "expert" ? "hard" : "medium",
  });

  // 5. Explore node — related content and next steps
  path.push({
    id: `sp_${position++}`,
    title: "Explore: Going Further",
    type: "explore",
    description: `Explore related materials, YouTube videos, and past papers for: ${topics.slice(0, 3).join(", ")}. This will deepen your understanding and connect concepts.`,
    estimatedTime: 30,
    prerequisites: orderedTopics.slice(-2),
    difficulty: "medium",
  });

  return path;
}

/**
 * Identify prerequisite topics — concepts the document assumes you already know.
 * Looks for phrases like "assuming you know X", "recall that X", "as discussed earlier".
 */
function identifyPrerequisites(text: string, topics: string[]): string[] {
  const prerequisites: string[] = [];
  const lower = text.toLowerCase();

  // Pattern: "assuming (knowledge of) X"
  const assumePattern = /(?:assuming|assume)\s+(?:knowledge\s+of\s+|familiarity\s+with\s+)?(.+?)[.;]/gi;
  let match: RegExpExecArray | null;
  const assumeRegex = new RegExp(assumePattern.source, "gi");
  while ((match = assumeRegex.exec(text)) !== null) {
    const prereq = match[1].trim();
    if (prereq.length > 3 && prereq.length < 80) prerequisites.push(prereq);
  }

  // Pattern: "recall that X" or "as discussed earlier"
  const recallPattern = /(?:recall\s+that|as\s+(?:discussed|mentioned|covered)\s+(?:earlier|before|previously))\s*:?\s*(.+?)[.;]/gi;
  const recallRegex = new RegExp(recallPattern.source, "gi");
  while ((match = recallRegex.exec(text)) !== null) {
    const prereq = match[1].trim();
    if (prereq.length > 3 && prereq.length < 80) prerequisites.push(prereq);
  }

  // Pattern: "prerequisite(s): X"
  const prereqPattern = /(?:prerequisite[s]?\s*[:.]\s*)(.+?)(?:\n|$)/gi;
  const prereqRegex = new RegExp(prereqPattern.source, "gi");
  while ((match = prereqRegex.exec(text)) !== null) {
    const prereq = match[1].trim();
    if (prereq.length > 3 && prereq.length < 80) prerequisites.push(prereq);
  }

  // If no explicit prerequisites found, infer from topics that appear early
  if (prerequisites.length === 0 && topics.length > 2) {
    // The first topic mentioned is often a prerequisite
    const firstMention = topics[0];
    if (firstMention) prerequisites.push(firstMention);
  }

  return [...new Set(prerequisites)].slice(0, 5);
}

/**
 * Order topics by dependency — topics that are prerequisites come first.
 */
function orderTopicsByDependency(topics: string[], graph: { nodes: { id: string; label: string }[]; edges: { source: string; target: string; relation: string }[] }): string[] {
  // Build a simple dependency graph
  const labelToId = new Map<string, string>();
  for (const node of graph.nodes) {
    labelToId.set(node.label.toLowerCase(), node.id);
  }

  const dependencies = new Map<string, Set<string>>();
  for (const topic of topics) {
    dependencies.set(topic, new Set());
  }

  // Check edges for "depends_on" or "part_of" relations
  for (const edge of graph.edges) {
    const sourceNode = graph.nodes.find((n) => n.id === edge.source);
    const targetNode = graph.nodes.find((n) => n.id === edge.target);
    if (!sourceNode || !targetNode) continue;

    const sourceTopic = topics.find((t) => t.toLowerCase() === sourceNode.label.toLowerCase());
    const targetTopic = topics.find((t) => t.toLowerCase() === targetNode.label.toLowerCase());
    if (!sourceTopic || !targetTopic) continue;

    if (edge.relation === "depends_on" || edge.relation === "part_of") {
      dependencies.get(sourceTopic)?.add(targetTopic);
    }
  }

  // Topological sort (simplified — just put topics with fewer deps first)
  const sorted = [...topics].sort((a, b) => {
    const aDeps = dependencies.get(a)?.size ?? 0;
    const bDeps = dependencies.get(b)?.size ?? 0;
    return aDeps - bDeps;
  });

  return sorted;
}

/**
 * Generate a progression plan across multiple materials.
 * Plans learning from beginner to advanced.
 */
export function generateProgressionPlan(
  materials: { id: string; title: string; summary?: string | null; content_year?: number | null; type?: string | null }[],
): ProgressionPlan {
  if (!materials || materials.length === 0) {
    return { levels: [], totalEstimatedTime: 0, currentLevel: "N/A", nextSteps: [] };
  }

  // Assess difficulty of each material
  const assessed = materials.map((m) => {
    const text = m.summary ?? m.title;
    const diff = assessDifficulty(text);
    return { ...m, difficulty: diff };
  });

  // Group by difficulty level
  const levels: ProgressionLevel[] = [];
  const levelOrder: { level: string; description: string; filter: (d: string) => boolean }[] = [
    { level: "Foundation", description: "Start here — build foundational knowledge", filter: (d) => d === "beginner" },
    { level: "Intermediate", description: "Core concepts and applications", filter: (d) => d === "intermediate" },
    { level: "Advanced", description: "Complex topics and deeper analysis", filter: (d) => d === "advanced" },
    { level: "Expert", description: "Research-level content and specialization", filter: (d) => d === "expert" },
  ];

  let totalTime = 0;
  for (const { level, description, filter } of levelOrder) {
    const levelMaterials = assessed.filter((m) => filter(m.difficulty.level));
    if (levelMaterials.length === 0) continue;

    const skills = levelMaterials
      .flatMap((m) => extractKeyTopics(m.summary ?? m.title, 3))
      .slice(0, 5);

    const time = levelMaterials.length * 60; // ~1 hour per material
    totalTime += time;

    levels.push({
      level,
      description,
      materials: levelMaterials.map((m) => m.id),
      skills: [...new Set(skills)],
      estimatedTime: time,
    });
  }

  // If no levels were created (all unknown difficulty), create a single level
  if (levels.length === 0) {
    levels.push({
      level: "General Study",
      description: "Study these materials in order",
      materials: materials.map((m) => m.id),
      skills: [],
      estimatedTime: materials.length * 60,
    });
    totalTime = materials.length * 60;
  }

  const currentLevel = levels[0]?.level ?? "N/A";
  const nextSteps = levels.slice(1).map((l) => `Progress to ${l.level}: ${l.description}`);

  return { levels, totalEstimatedTime: totalTime, currentLevel, nextSteps };
}

/**
 * Build a glossary from the document — key terms with definitions.
 */
export function buildGlossary(text: string): GlossaryEntry[] {
  if (!text) return [];

  const entities = extractEntities(text);
  const keywords = extractKeywords(text, 20);
  const glossary: GlossaryEntry[] = [];
  const seen = new Set<string>();

  // Look for definitions in text
  const defPatterns: { regex: RegExp; termGroup: number; defGroup: number }[] = [
    { regex: /^(.+?)\s+(?:is|are)\s+defined\s+as\s+(.+?)[.;]/gm, termGroup: 1, defGroup: 2 },
    { regex: /^(.+?)\s+refers?\s+to\s+(.+?)[.;]/gm, termGroup: 1, defGroup: 2 },
    { regex: /^(.+?)\s+means?\s+(.+?)[.;]/gm, termGroup: 1, defGroup: 2 },
    { regex: /^(.+?)\s+(?:is|are)\s+(?:a|an|the)\s+(.+?)[.;]/gm, termGroup: 1, defGroup: 2 },
    { regex: /(?:definition\s+of)\s+(.+?)\s+is\s+(.+?)[.;]/gi, termGroup: 1, defGroup: 2 },
  ];

  for (const pattern of defPatterns) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const term = match[pattern.termGroup].trim();
      const definition = match[pattern.defGroup].trim();
      const key = term.toLowerCase();

      if (seen.has(key)) continue;
      if (term.length < 3 || term.length > 60) continue;
      if (definition.length < 10 || definition.length > 250) continue;
      if (["it", "this", "that", "these", "those", "there", "here"].includes(term.toLowerCase())) continue;

      const idx = text.indexOf(term);
      const relatedTerms = keywords
        .filter((k) => k.toLowerCase() !== key && definition.toLowerCase().includes(k.toLowerCase()))
        .slice(0, 3);

      seen.add(key);
      glossary.push({
        term,
        definition,
        firstOccurrence: idx,
        relatedTerms,
      });
    }
  }

  // Add high-frequency terms without definitions
  for (const entity of entities.filter((e) => e.type === "concept" || e.type === "term").slice(0, 10)) {
    const key = entity.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    glossary.push({
      term: entity.text,
      definition: entity.contexts[0] ?? "Key term in this document.",
      firstOccurrence: 0,
      relatedTerms: [],
    });
  }

  return glossary.sort((a, b) => a.term.localeCompare(b.term));
}
