// ═══════════════════════════════════════════════════════════════════
// Learnova AI v2 — Outdated Document Detector (6-year threshold)
// Enhanced with severity levels and detailed warning comments.
// No external APIs. Pure TypeScript.
// ═══════════════════════════════════════════════════════════════════

import type { OutdatedResult } from "./types";

export const OUTDATED_THRESHOLD_YEARS = 6;

export function checkOutdated(contentYear: number | null | undefined): OutdatedResult {
  const currentYear = new Date().getFullYear();
  if (contentYear == null || isNaN(contentYear)) {
    return { isOutdated: false, yearsOld: null, comment: null, severity: "none" };
  }
  const yearsOld = currentYear - contentYear;
  if (yearsOld >= OUTDATED_THRESHOLD_YEARS) {
    const severity = yearsOld >= 10 ? "critical" : "warning";
    return { isOutdated: true, yearsOld, comment: generateOutdatedComment(contentYear, yearsOld, currentYear), severity };
  }
  return { isOutdated: false, yearsOld, comment: null, severity: "none" };
}

function generateOutdatedComment(contentYear: number, yearsOld: number, currentYear: number): string {
  const messages: string[] = [];
  messages.push(`⚠️ This document is from ${contentYear} (${yearsOld} years old). Some information may be outdated.`);
  if (yearsOld >= 10) {
    messages.push("This content is over a decade old — significant changes in the field are likely. Cross-reference with current sources before relying on specific facts, figures, or regulations.");
  } else if (yearsOld >= 8) {
    messages.push("This content is several years old. While core concepts may still apply, check for updated theories, revised standards, or new research that may supersede this material.");
  } else {
    messages.push("This content is a few years old. Fundamental concepts are likely still valid, but verify any specific data, statistics, or references against more recent sources.");
  }
  messages.push(`Consider looking for a more recent version (${currentYear - 2} or later) or supplementing this with current course materials.`);
  return messages.join(" ");
}

export function batchCheckOutdated(materials: { id: string; content_year: number | null | undefined }[]): Map<string, OutdatedResult> {
  const results = new Map<string, OutdatedResult>();
  for (const m of materials) results.set(m.id, checkOutdated(m.content_year));
  return results;
}

export function getOutdatedSeverity(contentYear: number | null | undefined): "none" | "warning" | "critical" {
  const currentYear = new Date().getFullYear();
  if (contentYear == null || isNaN(contentYear)) return "none";
  const yearsOld = currentYear - contentYear;
  if (yearsOld >= 10) return "critical";
  if (yearsOld >= OUTDATED_THRESHOLD_YEARS) return "warning";
  return "none";
}
