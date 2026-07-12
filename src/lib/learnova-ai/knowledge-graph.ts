// ═══════════════════════════════════════════════════════════════════
// Learnova AI v2 — Knowledge Graph Builder
// Builds a concept-level knowledge graph from document text using
// co-occurrence analysis, definition extraction, and hierarchical
// clustering. Identifies concept clusters and relationships.
// No external APIs. Pure TypeScript.
// ═══════════════════════════════════════════════════════════════════

import { tokenizeContent, stem, coOccurrenceMatrix, extractPhraseChunks, termFrequency } from "./tokenizer";
import { extractKeywords } from "./keyword-extractor";
import type { KnowledgeGraph, ConceptNode, KnowledgeGraphEdge, ConceptCluster } from "./types";

/**
 * Build a knowledge graph from document text.
 *
 * Nodes = key concepts (keywords + phrase chunks + entities)
 * Edges = co-occurrence relationships weighted by frequency
 * Clusters = groups of related concepts
 */
export function buildKnowledgeGraph(text: string): KnowledgeGraph {
  if (!text || text.trim().length < 50) {
    return { nodes: [], edges: [], clusters: [] };
  }

  // 1. Extract concept candidates
  const keywords = extractKeywords(text, 30);
  const phrases = extractPhraseChunks(text, 2, 4).slice(0, 20);
  const concepts = [...new Set([...keywords, ...phrases])];

  // 2. Build co-occurrence matrix
  const coOccur = coOccurrenceMatrix(text, 8);

  // 3. Create nodes
  const nodes: ConceptNode[] = [];
  const stemToId = new Map<string, string>();
  const termFreq = termFrequency(text);

  for (let i = 0; i < concepts.length; i++) {
    const concept = concepts[i];
    const conceptStem = stem(concept.toLowerCase().split(/\s+/)[0]);
    const id = `node_${i}`;
    const freq = termFreq.get(conceptStem) ?? 1;

    // Determine node type
    let type: ConceptNode["type"] = "concept";
    if (/^[A-Z]/.test(concept) && concept.split(/\s+/).length > 1) type = "entity";
    else if (/\b(law|principle|rule|theorem)\b/i.test(concept)) type = "law";
    else if (/[=∑∫∏∂∇√]/.test(concept)) type = "formula";
    else if (/\b(method|approach|technique|procedure|algorithm|process)\b/i.test(concept)) type = "method";
    else type = "concept";

    nodes.push({
      id,
      label: concept,
      type,
      weight: freq,
      definition: findDefinition(text, concept),
      relatedIds: [],
    });
    stemToId.set(conceptStem, id);
  }

  // 4. Build edges from co-occurrence
  const edges: KnowledgeGraphEdge[] = [];
  const edgeSet = new Set<string>();

  for (let i = 0; i < nodes.length; i++) {
    const nodeStem = stem(nodes[i].label.toLowerCase().split(/\s+/)[0]);
    const coOccurMap = coOccur.get(nodeStem);

    if (!coOccurMap) continue;

    // Find top co-occurring concepts
    const related = [...coOccurMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    for (const [relatedStem, weight] of related) {
      const relatedId = stemToId.get(relatedStem);
      if (!relatedId || relatedId === nodes[i].id) continue;

      const edgeKey = [nodes[i].id, relatedId].sort().join("→");
      if (edgeSet.has(edgeKey)) continue;
      edgeSet.add(edgeKey);

      // Determine relationship type
      const relation = inferRelation(text, nodes[i].label, nodes.find((n) => n.id === relatedId)!.label);

      edges.push({
        source: nodes[i].id,
        target: relatedId,
        relation,
        weight,
      });

      // Update relatedIds
      if (!nodes[i].relatedIds.includes(relatedId)) {
        nodes[i].relatedIds.push(relatedId);
      }
    }
  }

  // 5. Cluster concepts using a simple greedy approach
  const clusters = clusterConcepts(nodes, edges);

  return { nodes, edges, clusters };
}

/**
 * Find a definition for a concept in the text.
 */
function findDefinition(text: string, concept: string): string | null {
  const conceptLower = concept.toLowerCase();

  // Look for "X is/are defined as/refers to/means Y" patterns
  const patterns: RegExp[] = [
    new RegExp(`${escapeRegex(conceptLower)}\\s+(?:is|are)\\s+defined\\s+as\\s+(.+?)[.;]`, "i"),
    new RegExp(`${escapeRegex(conceptLower)}\\s+refers?\\s+to\\s+(.+?)[.;]`, "i"),
    new RegExp(`${escapeRegex(conceptLower)}\\s+means?\\s+(.+?)[.;]`, "i"),
    new RegExp(`${escapeRegex(conceptLower)}\\s+(?:is|are)\\s+(?:a|an|the)\\s+(.+?)[.;]`, "i"),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }

  return null;
}

/**
 * Infer the relationship between two concepts.
 */
function inferRelation(text: string, conceptA: string, conceptB: string): string {
  const aLower = conceptA.toLowerCase();
  const bLower = conceptB.toLowerCase();

  // Check for "A is a type of B" or "A is a B"
  if (new RegExp(`${escapeRegex(aLower)}\\s+(?:is|are)\\s+a\\s+(?:type|kind|form|class)\\s+of\\s+${escapeRegex(bLower)}`, "i").test(text)) {
    return "is_a";
  }
  if (new RegExp(`${escapeRegex(bLower)}\\s+(?:is|are)\\s+a\\s+(?:type|kind|form|class)\\s+of\\s+${escapeRegex(aLower)}`, "i").test(text)) {
    return "has_subtype";
  }

  // Check for "A consists of B" or "A includes B"
  if (new RegExp(`${escapeRegex(aLower)}\\s+(?:consists|includes|contains|comprises)\\s+${escapeRegex(bLower)}`, "i").test(text)) {
    return "contains";
  }
  if (new RegExp(`${escapeRegex(bLower)}\\s+(?:consists|includes|contains|comprises)\\s+${escapeRegex(aLower)}`, "i").test(text)) {
    return "part_of";
  }

  // Check for "A causes B" or "A leads to B"
  if (new RegExp(`${escapeRegex(aLower)}\\s+(?:causes|leads\\s+to|results\\s+in|produces)\\s+${escapeRegex(bLower)}`, "i").test(text)) {
    return "causes";
  }
  if (new RegExp(`${escapeRegex(bLower)}\\s+(?:causes|leads\\s+to|results\\s+in|produces)\\s+${escapeRegex(aLower)}`, "i").test(text)) {
    return "caused_by";
  }

  // Check for "A depends on B"
  if (new RegExp(`${escapeRegex(aLower)}\\s+(?:depends|relies)\\s+on\\s+${escapeRegex(bLower)}`, "i").test(text)) {
    return "depends_on";
  }

  // Check for "A is used for B"
  if (new RegExp(`${escapeRegex(aLower)}\\s+(?:is|are)\\s+used\\s+(?:for|in|to)\\s+${escapeRegex(bLower)}`, "i").test(text)) {
    return "used_for";
  }

  // Check for contrast
  if (new RegExp(`${escapeRegex(aLower)}\\s+(?:unlike|in\\s+contrast\\s+to|whereas|while|as\\s+opposed\\s+to)\\s+${escapeRegex(bLower)}`, "i").test(text)) {
    return "contrasts_with";
  }

  // Default: co-occurs
  return "related_to";
}

/**
 * Cluster concepts using greedy modularity-like approach.
 */
function clusterConcepts(nodes: ConceptNode[], edges: KnowledgeGraphEdge[]): ConceptCluster[] {
  if (nodes.length === 0) return [];

  // Build adjacency list
  const adjacency = new Map<string, Set<string>>();
  for (const node of nodes) adjacency.set(node.id, new Set());
  for (const edge of edges) {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }

  // Greedy clustering: start with each node in its own cluster,
  // merge clusters that share many edges
  const clusters: Set<string>[] = nodes.map((n) => new Set([n.id]));

  let changed = true;
  let iterations = 0;
  while (changed && iterations < 20) {
    changed = false;
    iterations++;

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        // Count edges between clusters
        let edgeCount = 0;
        for (const a of clusters[i]) {
          for (const b of clusters[j]) {
            if (adjacency.get(a)?.has(b)) edgeCount++;
          }
        }

        // Merge if they share at least 2 edges or if either is very small
        if (edgeCount >= 2 || (edgeCount >= 1 && (clusters[i].size <= 2 || clusters[j].size <= 2))) {
          clusters[i] = new Set([...clusters[i], ...clusters[j]]);
          clusters.splice(j, 1);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }

  // Convert to ConceptCluster objects
  const result: ConceptCluster[] = [];
  for (let i = 0; i < clusters.length; i++) {
    const nodeIds = [...clusters[i]];
    const clusterNodes = nodes.filter((n) => nodeIds.includes(n.id));

    // Label = most frequent concept in cluster
    const label = clusterNodes.sort((a, b) => b.weight - a.weight)[0]?.label ?? `Cluster ${i + 1}`;

    // Summary = top concepts
    const summary = clusterNodes
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5)
      .map((n) => n.label)
      .join(", ");

    result.push({
      id: `cluster_${i}`,
      label,
      nodeIds,
      summary,
    });
  }

  return result.sort((a, b) => b.nodeIds.length - a.nodeIds.length);
}

/**
 * Extract a concept map from the knowledge graph.
 * Returns a simplified view suitable for visualization.
 */
export function extractConceptMap(graph: KnowledgeGraph): {
  nodes: { id: string; label: string; type: string; weight: number }[];
  edges: { source: string; target: string; relation: string }[];
  gaps: string[];
  coverage: number;
} {
  const nodes = graph.nodes.map((n) => ({
    id: n.id,
    label: n.label,
    type: n.type,
    weight: n.weight,
  }));

  const edges = graph.edges.map((e) => ({
    source: e.source,
    target: e.target,
    relation: e.relation,
  }));

  // Identify gaps — nodes with very few connections (potential areas to expand)
  const gaps: string[] = [];
  const connectionCount = new Map<string, number>();
  for (const node of graph.nodes) connectionCount.set(node.id, 0);
  for (const edge of graph.edges) {
    connectionCount.set(edge.source, (connectionCount.get(edge.source) ?? 0) + 1);
    connectionCount.set(edge.target, (connectionCount.get(edge.target) ?? 0) + 1);
  }

  for (const [nodeId, count] of connectionCount) {
    if (count <= 1) {
      const node = graph.nodes.find((n) => n.id === nodeId);
      if (node) gaps.push(node.label);
    }
  }

  // Coverage = ratio of connected nodes to total
  const connected = [...connectionCount.values()].filter((c) => c > 0).length;
  const coverage = graph.nodes.length > 0 ? connected / graph.nodes.length : 0;

  return { nodes, edges, gaps, coverage };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
