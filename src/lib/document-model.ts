export type DocumentBlockKind =
  | "heading"
  | "paragraph"
  | "list-item"
  | "table"
  | "formula"
  | "question"
  | "figure"
  | "diagram"
  | "chart"
  | "unknown";

export type DocumentExtractionMethod =
  | "native"
  | "ocr"
  | "mixed"
  | "structured"
  | "visual"
  | "unknown";

export type DocumentVisualType =
  | "image"
  | "figure"
  | "diagram"
  | "chart"
  | "graph"
  | "table"
  | "formula"
  | "handwriting"
  | "photo"
  | "unknown";

export type DocumentVisualFinding = {
  id: string;
  type: DocumentVisualType;
  title?: string;
  description: string;
  extractedText?: string;
  confidence: number;
  source:
    | "puter-vision"
    | "puter-ocr"
    | "openrouter-vision"
    | "openrouter-ocr"
    | "native";
  sourceRef?: string;
  metadata?: Record<
    string,
    unknown
  >;
};

export type DocumentBlock = {
  id: string;
  kind: DocumentBlockKind;
  text: string;
  sourceIndex: number;
  confidence: number;
  extraction: DocumentExtractionMethod;
};

export type DocumentUnit = {
  index: number;
  label: string;
  extraction: DocumentExtractionMethod;
  text: string;
  blocks: DocumentBlock[];
  confidence: number;
  visualFindings: DocumentVisualFinding[];
  visualConfidence: number;
};

export type AcademicDocumentModel = {
  version: 2;
  format: string;
  documentType: string;
  classificationConfidence: number;
  classificationEvidence: string[];
  units: DocumentUnit[];
  headings: string[];
  formulas: string[];
  questions: string[];
  tables: string[];
  figures: string[];
  visualFindings: DocumentVisualFinding[];
  coverage: number;
  extractionConfidence: number;
  signals: {
    abnormalCharacterRatio: number;
    repeatedTokenRatio: number;
    readableUnitRatio: number;
    visualUnitRatio: number;
    visualFindingCount: number;
    headingCount: number;
    formulaCount: number;
    questionCount: number;
    tableCount: number;
    figureCount: number;
  };
};

export type DocumentClassification = {
  detectedType: string;
  confidence: number;
  evidence: string[];
};

const CLASSIFICATION_RULES: Array<{
  type: string;
  weight: number;
  evidence: Array<
    [RegExp, string]
  >;
}> = [
  {
    type:
      "Past Paper",
    weight: 2,
    evidence: [
      [
        /(?:test|examination|exam|mid[- ]?semester|final|past paper)/i,
        "exam/test wording",
      ],
      [
        /(?:answer all questions|time allowed|marks?)/i,
        "candidate instructions or marks",
      ],
      [
        /(?:section\s+[a-d]|question\s*\d+|\d+[.)]\s+)/i,
        "question or section structure",
      ],
      [
        /(?:multiple choice|choose one|candidate)/i,
        "assessment wording",
      ],
    ],
  },
  {
    type:
      "Assignment",
    weight: 2,
    evidence: [
      [
        /(?:assignment|submit|submission|coursework|deadline|task)/i,
        "assignment wording",
      ],
      [
        /\binstructions?\b/i,
        "instructions",
      ],
    ],
  },
  {
    type:
      "Outline",
    weight: 2,
    evidence: [
      [
        /course\s+outline/i,
        "course-outline heading",
      ],
      [
        /(?:learning outcomes?|objectives?|weekly topics?|course content)/i,
        "course structure wording",
      ],
    ],
  },
  {
    type:
      "Slides",
    weight: 1.5,
    evidence: [
      [
        /slide\s*\d+/i,
        "slide boundaries",
      ],
      [
        /(?:lecture|presentation|powerpoint)/i,
        "presentation wording",
      ],
    ],
  },
  {
    type:
      "Notes",
    weight: 1,
    evidence: [
      [
        /(?:definition|example|therefore|introduction|conclusion)/i,
        "lecture-style explanation",
      ],
    ],
  },
];

function bounded(
  value: unknown,
  fallback = 0,
): number {
  const parsed =
    typeof value ===
    "number"
      ? value
      : Number(value);

  if (
    !Number.isFinite(
      parsed,
    )
  ) {
    return fallback;
  }

  return Math.max(
    0,
    Math.min(
      1,
      parsed,
    ),
  );
}

function shortId(
  prefix: string,
  unitIndex: number,
  itemIndex: number,
): string {
  return `${prefix}-${unitIndex}-${itemIndex}`;
}

export function classifyAcademicDocument(
  text: string,
  format = "",
): DocumentClassification {
  const source =
    `${format} ${text}`.slice(
      0,
      40_000,
    );

  if (
    /\b(?:pptx?|powerpoint|slides?)\b/i.test(
      format,
    )
  ) {
    return {
      detectedType:
        "Slides",
      confidence:
        0.96,
      evidence: [
        "PowerPoint/slide file format",
      ],
    };
  }

  const scores =
    new Map<
      string,
      {
        score: number;
        evidence: string[];
      }
    >();

  for (
    const rule of CLASSIFICATION_RULES
  ) {
    const matches =
      rule.evidence
        .filter(
          ([pattern]) =>
            pattern.test(
              source,
            ),
        )
        .map(
          ([, label]) =>
            label,
        );

    if (
      matches.length
    ) {
      scores.set(
        rule.type,
        {
          score:
            matches.length *
            rule.weight,
          evidence:
            matches,
        },
      );
    }
  }

  const ranked =
    [
      ...scores.entries(),
    ].sort(
      (
        a,
        b,
      ) =>
        b[1].score -
        a[1].score,
    );

  const winner =
    ranked[0];

  if (!winner) {
    return {
      detectedType:
        "Notes",
      confidence:
        0.25,
      evidence: [
        "No strong document-type signals found",
      ],
    };
  }

  const secondScore =
    ranked[1]?.[1].score ??
    0;

  const confidence =
    Math.max(
      0.25,
      Math.min(
        0.99,
        0.45 +
          winner[1].score *
            0.08 -
          secondScore *
            0.03,
      ),
    );

  return {
    detectedType:
      winner[0],
    confidence:
      Math.round(
        confidence * 100,
      ) / 100,
    evidence:
      winner[1].evidence,
  };
}

function classifyLine(
  line: string,
): DocumentBlockKind {
  if (
    /^(question\s+\d+[\w.-]*|\d+[.)]\s+|[a-z][.)]\s+)/i.test(
      line,
    )
  ) {
    return "question";
  }

  if (
    /^(?:[-*•]|\d+[.)])\s+/.test(
      line,
    )
  ) {
    return "list-item";
  }

  if (
    /^\|.+\|$/.test(
      line,
    ) ||
    /\t.+\t/.test(line)
  ) {
    return "table";
  }

  if (
    /(?:det|var|lim|sum|sqrt|lambda|pi|mu|sigma|alpha|beta|theta|log|ln)\b|[=∑√λπμσ∞≤≥→↔∂]|\b[A-Z]\s*=\s*/i.test(
      line,
    )
  ) {
    return "formula";
  }

  if (
    /^(?:figure|fig\.?|diagram|chart|graph)\b/i.test(
      line,
    )
  ) {
    return "figure";
  }

  if (
    line.length <=
      110 &&
    (
      /^[A-Z\d][A-Z\d\s:&(),'-]+$/.test(
        line,
      ) ||
      /^(unit|chapter|topic|lecture|slide|section|week|module)\b/i.test(
        line,
      )
    )
  ) {
    return "heading";
  }

  return "paragraph";
}

function qualitySignals(
  text: string,
) {
  const chars =
    Array.from(
      text,
    );

  const abnormal =
    chars.filter(
      (c) =>
        /[�□■]|[^\x09\x0A\x0D\x20-\x7E\u00A0-\u024F\u0370-\u03FF\u2000-\u206F\u2070-\u209F\u2100-\u214F\u2190-\u21FF\u2200-\u22FF]/u.test(
          c,
        ),
    ).length;

  const words =
    text
      .toLowerCase()
      .match(
        /[a-z]{2,}/g,
      ) ?? [];

  const counts =
    new Map<
      string,
      number
    >();

  for (
    const word of words
  ) {
    counts.set(
      word,
      (counts.get(
        word,
      ) ?? 0) + 1,
    );
  }

  const repeated =
    Array.from(
      counts.values(),
    )
      .filter(
        (count) =>
          count > 12,
      )
      .reduce(
        (
          sum,
          count,
        ) =>
          sum +
          count -
          12,
        0,
      );

  return {
    abnormalCharacterRatio:
      chars.length
        ? abnormal /
          chars.length
        : 1,
    repeatedTokenRatio:
      words.length
        ? repeated /
          words.length
        : 1,
  };
}

function cleanBlockText(
  value: string,
): string {
  return value
    .replace(
      /\u0000/g,
      "",
    )
    .replace(
      /\r\n?/g,
      "\n",
    )
    .replace(
      /[ \t]+/g,
      " ",
    )
    .replace(
      /\n{3,}/g,
      "\n\n",
    )
    .trim();
}

export function buildAcademicDocumentModel(
  input: {
    format: string;
    documentType?: string;
    units: Array<{
      label: string;
      text: string;
      extraction?:
        | DocumentExtractionMethod;
      confidence?: number;
      visualFindings?:
        DocumentVisualFinding[];
    }>;
  },
): AcademicDocumentModel {
  const classification =
    input.documentType &&
    input.documentType !==
      "unknown"
      ? {
          detectedType:
            input.documentType,
          confidence:
            1,
          evidence: [
            "Explicit document type selection",
          ],
        }
      : classifyAcademicDocument(
          input.units
            .map(
              (
                unit,
              ) =>
                unit.text,
            )
            .join(
              "\n",
            ),
          input.format,
        );

  const units =
    input.units.map(
      (
        unit,
        index,
      ) => {
        const unitNumber =
          index + 1;

        const text =
          cleanBlockText(
            unit.text ??
              "",
          );

        const extraction =
          unit.extraction ??
          "unknown";

        const confidence =
          bounded(
            unit.confidence,
            text.length >=
              25
              ? 0.9
              : 0.15,
          );

        const blocks =
          text
            .split(
              /\n+/,
            )
            .map(
              (
                line,
              ) =>
                line.trim(),
            )
            .filter(
              Boolean,
            )
            .map(
              (
                line,
                sourceIndex,
              ) => ({
                id:
                  shortId(
                    "b",
                    unitNumber,
                    sourceIndex,
                  ),
                kind:
                  classifyLine(
                    line,
                  ),
                text:
                  line,
                sourceIndex,
                confidence,
                extraction,
              }),
            );

        const visualFindings =
          (
            unit.visualFindings ??
            []
          ).filter(
            (
              finding,
            ) =>
              cleanBlockText(
                finding.description,
              ),
          );

        const visualConfidence =
          visualFindings.length
            ? visualFindings.reduce(
                (
                  sum,
                  finding,
                ) =>
                  sum +
                  bounded(
                    finding.confidence,
                  ),
                0,
              ) /
              visualFindings.length
            : 0;

        return {
          index:
            unitNumber,
          label:
            cleanBlockText(
              unit.label,
            ) ||
            `Unit ${unitNumber}`,
          extraction,
          text,
          blocks,
          confidence,
          visualFindings,
          visualConfidence,
        };
      },
    );

  const allBlocks =
    units.flatMap(
      (
        unit,
      ) =>
        unit.blocks,
    );

  const visualFindings =
    units.flatMap(
      (
        unit,
      ) =>
        unit.visualFindings,
    );

  const text =
    units
      .map(
        (
          unit,
        ) =>
          unit.text,
      )
      .join(
        "\n",
      );

  const signals =
    qualitySignals(
      text,
    );

  const readableUnits =
    units.filter(
      (
        unit,
      ) =>
        unit.text.trim()
          .length >=
          20 ||
        unit.confidence >=
          0.7 ||
        unit.visualFindings.some(
          (
            finding,
          ) =>
            bounded(
              finding.confidence,
            ) >=
            0.65,
        ),
    ).length;

  const readableUnitRatio =
    units.length
      ? readableUnits /
        units.length
      : 0;

  const visualUnitRatio =
    units.length
      ? units.filter(
          (
            unit,
          ) =>
            unit.visualFindings
              .length >
            0,
        ).length /
        units.length
      : 0;

  const averageUnitConfidence =
    units.length
      ? units.reduce(
          (
            sum,
            unit,
          ) => {
            const visualBoost =
              unit.visualFindings
                .length
                ? Math.max(
                    unit.visualConfidence *
                      0.25,
                    0.05,
                  )
                : 0;

            return (
              sum +
              Math.min(
                1,
                unit.confidence +
                  visualBoost,
              )
            );
          },
          0,
        ) / units.length
      : 0;

  const structureCount =
    allBlocks.filter(
      (
        block,
      ) =>
        block.kind !==
        "paragraph",
    ).length;

  const structureBonus =
    Math.min(
      0.12,
      structureCount /
        Math.max(
          100,
          allBlocks.length *
            8,
        ),
    );

  const abnormalPenalty =
    Math.min(
      0.20,
      signals.abnormalCharacterRatio *
        1.25,
    );

  const repeatedPenalty =
    Math.min(
      0.10,
      signals.repeatedTokenRatio *
        0.22,
    );

  const visualBonus =
    Math.min(
      0.10,
      visualUnitRatio *
        0.08 +
        Math.min(
          0.02,
          visualFindings.length *
            0.001,
        ),
    );

  const extractionConfidence =
    Math.max(
      0,
      Math.min(
        1,
        averageUnitConfidence *
          0.55 +
          readableUnitRatio *
            0.35 +
          structureBonus +
          visualBonus -
          abnormalPenalty -
          repeatedPenalty,
      ),
    );

  const coverage =
    units.length
      ? Math.round(
          (units.filter(
            (
              unit,
            ) =>
              unit.text
                .trim()
                .length >=
                12 ||
              unit.confidence >=
                0.65 ||
              unit.visualFindings
                .length >
                0,
          ).length /
            units.length) *
            100,
        ) / 100
      : 0;

  return {
    version: 2,
    format:
      input.format,
    documentType:
      classification.detectedType,
    classificationConfidence:
      classification.confidence,
    classificationEvidence:
      classification.evidence,
    units,
    headings:
      allBlocks
        .filter(
          (
            block,
          ) =>
            block.kind ===
            "heading",
        )
        .map(
          (
            block,
          ) =>
            block.text,
        )
        .slice(
          0,
          150,
        ),
    formulas:
      allBlocks
        .filter(
          (
            block,
          ) =>
            block.kind ===
            "formula",
        )
        .map(
          (
            block,
          ) =>
            block.text,
        )
        .slice(
          0,
          150,
        ),
    questions:
      allBlocks
        .filter(
          (
            block,
          ) =>
            block.kind ===
            "question",
        )
        .map(
          (
            block,
          ) =>
            block.text,
        )
        .slice(
          0,
          150,
        ),
    tables:
      allBlocks
        .filter(
          (
            block,
          ) =>
            block.kind ===
            "table",
        )
        .map(
          (
            block,
          ) =>
            block.text,
        )
        .slice(
          0,
          100,
        ),
    figures:
      visualFindings
        .filter(
          (
            finding,
          ) =>
            [
              "figure",
              "diagram",
              "chart",
              "graph",
            ].includes(
              finding.type,
            ),
        )
        .map(
          (
            finding,
          ) =>
            finding.description,
        )
        .slice(
          0,
          100,
        ),
    visualFindings:
      visualFindings.slice(
        0,
        250,
      ),
    coverage,
    extractionConfidence:
      Math.round(
        extractionConfidence *
          100,
      ) / 100,
    signals: {
      abnormalCharacterRatio:
        Math.round(
          signals.abnormalCharacterRatio *
            10_000,
        ) / 10_000,
      repeatedTokenRatio:
        Math.round(
          signals.repeatedTokenRatio *
            10_000,
        ) / 10_000,
      readableUnitRatio:
        Math.round(
          readableUnitRatio *
            10_000,
        ) / 10_000,
      visualUnitRatio:
        Math.round(
          visualUnitRatio *
            10_000,
        ) / 10_000,
      visualFindingCount:
        visualFindings.length,
      headingCount:
        allBlocks.filter(
          (
            block,
          ) =>
            block.kind ===
            "heading",
        ).length,
      formulaCount:
        allBlocks.filter(
          (
            block,
          ) =>
            block.kind ===
            "formula",
        ).length,
      questionCount:
        allBlocks.filter(
          (
            block,
          ) =>
            block.kind ===
            "question",
        ).length,
      tableCount:
        allBlocks.filter(
          (
            block,
          ) =>
            block.kind ===
            "table",
        ).length,
      figureCount:
        visualFindings.filter(
          (
            finding,
          ) =>
            [
              "figure",
              "diagram",
              "chart",
              "graph",
            ].includes(
              finding.type,
            ),
        ).length,
    },
  };
}

export function mergeVisualFindings(
  model: AcademicDocumentModel,
  updates: Array<{
    unitIndex: number;
    findings: DocumentVisualFinding[];
  }>,
): AcademicDocumentModel {
  const updateMap =
    new Map<
      number,
      DocumentVisualFinding[]
    >();

  for (
    const update of updates
  ) {
    const current =
      updateMap.get(
        update.unitIndex,
      ) ?? [];

    current.push(
      ...update.findings,
    );

    updateMap.set(
      update.unitIndex,
      current,
    );
  }

  const units =
    model.units.map(
      (
        unit,
      ) => {
        const incoming =
          updateMap.get(
            unit.index,
          ) ?? [];

        const byId =
          new Map<
            string,
            DocumentVisualFinding
          >();

        [
          ...unit.visualFindings,
          ...incoming,
        ].forEach(
          (
            finding,
          ) =>
            byId.set(
              finding.id,
              finding,
            ),
        );

        const visualFindings =
          [
            ...byId.values(),
          ].slice(
            0,
            60,
          );

        const visualConfidence =
          visualFindings.length
            ? visualFindings.reduce(
                (
                  sum,
                  finding,
                ) =>
                  sum +
                  bounded(
                    finding.confidence,
                  ),
                0,
              ) /
              visualFindings.length
            : 0;

        const hasOpenRouter =
          visualFindings.some(
            (
              finding,
            ) =>
              finding.source ===
                "openrouter-vision" ||
              finding.source ===
                "openrouter-ocr",
          );

        const hasPuter =
          visualFindings.some(
            (
              finding,
            ) =>
              finding.source ===
                "puter-vision" ||
              finding.source ===
                "puter-ocr",
          );

        return {
          ...unit,
          extraction:
            visualFindings.length &&
            unit.extraction ===
              "unknown"
              ? "visual"
              : hasOpenRouter &&
                  hasPuter
                ? "mixed"
                : unit.extraction,
          blocks:
            unit.blocks,
          visualFindings,
          visualConfidence,
        };
      },
    );

  const rebuilt =
    buildAcademicDocumentModel({
      format:
        model.format,
      documentType:
        model.documentType,
      units:
        units.map(
          (
            unit,
          ) => ({
            label:
              unit.label,
            text:
              unit.text,
            extraction:
              unit.extraction,
            confidence:
              unit.confidence,
            visualFindings:
              unit.visualFindings,
          }),
        ),
    });

  return {
    ...rebuilt,
    version: 2,
  };
}

export function serializeDocumentForStudy(
  model: AcademicDocumentModel,
): string {
  const parts: string[] =
    [];

  for (
    const unit of model.units
  ) {
    const lines = [
      `=== ${unit.label} ===`,
    ];

    for (
      const block of unit.blocks
    ) {
      lines.push(
        `[${block.kind}] ${block.text}`,
      );
    }

    for (
      const finding of unit.visualFindings
    ) {
      const typeLabel =
        finding.type.replace(
          /-/g,
          " ",
        );

      if (
        finding.extractedText?.trim()
      ) {
        lines.push(
          `[visual-${typeLabel}-text] ${finding.extractedText.trim()}`,
        );
      }

      if (
        finding.description.trim()
      ) {
        lines.push(
          `[visual-${typeLabel}] ${finding.description.trim()}`,
        );
      }
    }

    if (
      lines.length ===
        1 &&
      unit.text.trim()
    ) {
      lines.push(
        unit.text.trim(),
      );
    }

    parts.push(
      lines.join(
        "\n",
      ),
    );
  }

  return parts
    .join(
      "\n\n",
    )
    .trim();
  }
