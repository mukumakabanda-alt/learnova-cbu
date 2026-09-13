import assert from "node:assert/strict";
import { buildAcademicDocumentModel } from "../src/lib/document-model";

const shortStructured = buildAcademicDocumentModel({
  format: "pptx",
  units: [
    { label: "Slide 1", text: "UNIT 1", extraction: "structured", confidence: 0.96 },
    { label: "Slide 2", text: "Y = C + I", extraction: "structured", confidence: 0.96 },
    { label: "Slide 3", text: "Demand and supply", extraction: "structured", confidence: 0.96 },
  ],
});

assert.equal(shortStructured.coverage, 1, "strong structured units must count as readable");
assert.ok(
  shortStructured.extractionConfidence >= 0.8,
  `structured slides should remain high confidence, got ${shortStructured.extractionConfidence}`,
);

const textRich = buildAcademicDocumentModel({
  format: "pdf",
  units: [
    {
      label: "Page 1",
      text: "Introduction to market equilibrium. Price adjusts when quantity supplied differs from quantity demanded.",
      extraction: "native",
      confidence: 0.96,
    },
    {
      label: "Page 2",
      text: "P = MC and Q* occurs where the curves intersect.",
      extraction: "native",
      confidence: 0.96,
    },
  ],
});

assert.equal(textRich.coverage, 1, "native text pages must remain fully covered");
assert.ok(textRich.formulas.length >= 1, "formula-like text must remain represented in the model");

console.log("Document quality regression checks passed.");
