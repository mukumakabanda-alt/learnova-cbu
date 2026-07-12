// ═══════════════════════════════════════════════════════════════════
// Learnova AI v2 — Named Entity Recognition (NER)
// Extracts persons, organizations, locations, dates, numbers,
// concepts, laws, theories, and more from text.
// No external APIs. Pure TypeScript, pattern-based + statistical.
// ═══════════════════════════════════════════════════════════════════

import { tokenize, tokenizeContent, stem } from "./tokenizer";
import type { ExtractedEntity } from "./types";

/**
 * Extract all named entities from text.
 */
export function extractEntities(text: string): ExtractedEntity[] {
  if (!text) return [];

  const entities: Map<string, ExtractedEntity> = new Map();

  // 1. Person names — "First Last" or "Dr. First Last" or "First M. Last"
  extractPersons(text, entities);

  // 2. Organizations — "University of X", "X Corporation", "X Institute"
  extractOrganizations(text, entities);

  // 3. Locations — countries, cities, "Mount X", "River X"
  extractLocations(text, entities);

  // 4. Dates — "2023", "January 2020", "15th century", "1990s"
  extractDates(text, entities);

  // 5. Numbers with units — "25 kg", "3.14", "50%", "10^5"
  extractNumbers(text, entities);

  // 6. Laws and theories — "Newton's Law", "Theory of Relativity"
  extractLawsAndTheories(text, entities);

  // 7. Chemical compounds — "H2O", "NaCl", "CO2"
  extractChemicals(text, entities);

  // 8. Academic concepts — capitalized multi-word phrases that appear frequently
  extractConcepts(text, entities);

  // 9. Equations and formulas referenced by name
  extractEquations(text, entities);

  // 10. Units of measurement
  extractUnits(text, entities);

  // 11. Key terms — high-frequency content words
  extractKeyTerms(text, entities);

  return [...entities.values()].sort((a, b) => b.frequency - a.frequency);
}

// ── Individual extractors ──

function addEntity(
  map: Map<string, ExtractedEntity>,
  text: string,
  type: ExtractedEntity["type"],
  context: string,
): void {
  const key = `${type}:${text.toLowerCase()}`;
  const existing = map.get(key);
  if (existing) {
    existing.frequency++;
    if (existing.contexts.length < 3) existing.contexts.push(context.slice(0, 100));
  } else {
    map.set(key, {
      text,
      type,
      frequency: 1,
      contexts: [context.slice(0, 100)],
      aliases: [],
    });
  }
}

function extractPersons(text: string, map: Map<string, ExtractedEntity>): void {
  // Pattern: "First Last" or "First M. Last" or "Dr./Prof. First Last"
  const patterns: RegExp[] = [
    /\b(?:Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g,
    /\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/g, // First Last
    /\b([A-Z][a-z]+\s+[A-Z]\.\s+[A-Z][a-z]+)\b/g, // First M. Last
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1] ?? match[0];
      // Filter out common false positives
      const lower = name.toLowerCase();
      if (isCommonPhrase(lower)) continue;
      // Must have at least 2 words
      if (name.split(/\s+/).length < 2) continue;
      const context = getSurroundingText(text, match.index, 80);
      addEntity(map, name, "person", context);
    }
  }
}

function extractOrganizations(text: string, map: Map<string, ExtractedEntity>): void {
  const patterns: RegExp[] = [
    /\b((?:University|Institute|College|School|Academy|Hospital|Foundation|Society|Association|Organization|Corporation|Corp|Inc|Ltd|LLC|Group|Agency|Bureau|Department|Ministry|Bank|Center|Centre|Laboratory|Lab)\s+(?:of\s+)?[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\b/g,
    /\b([A-Z][a-zA-Z]+\s+(?:University|Institute|College|School|Corporation|Corp|Inc|Ltd|Foundation|Society|Association|Agency|Bureau|Bank|Center|Centre|Laboratory|Lab))\b/g,
    /\b((?:UN|EU|NATO|WHO|UNESCO|NASA|FBI|CIA|MIT|Oxford|Cambridge|Harvard|Stanford|Yale|Princeton))\b/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const org = match[1] ?? match[0];
      const context = getSurroundingText(text, match.index, 80);
      addEntity(map, org, "organization", context);
    }
  }
}

function extractLocations(text: string, map: Map<string, ExtractedEntity>): void {
  const patterns: RegExp[] = [
    // Countries (common list)
    /\b((?:United States|United Kingdom|South Africa|Zambia|Zimbabwe|Nigeria|Kenya|Ghana|Egypt|Morocco|Tanzania|Uganda|Ethiopia|Rwanda|Botswana|Namibia|Mozambique|Malawi|Angola|Cameroon|Senegal|Mali|Sudan|Tunisia|Algeria|Libya|China|Japan|India|Brazil|Russia|France|Germany|Spain|Italy|Portugal|Netherlands|Belgium|Switzerland|Austria|Sweden|Norway|Denmark|Finland|Poland|Greece|Turkey|Israel|Saudi Arabia|UAE|Qatar|Kuwait|Iran|Iraq|Pakistan|Bangladesh|Sri Lanka|Thailand|Vietnam|Philippines|Indonesia|Malaysia|Singapore|South Korea|North Korea|Taiwan|Hong Kong|Australia|New Zealand|Canada|Mexico|Argentina|Chile|Colombia|Peru|Venezuela|Cuba|Jamaica|Ireland|Scotland|Wales|Iceland))\b/g,
    // Cities (common)
    /\b((?:Lusaka|Harare|Pretoria|Cape Town|Johannesburg|Durban|Nairobi|Lagos|Accra|Cairo|Casablanca|Dar es Salaam|Kampala|Addis Ababa|Kigali|Gaborone|Windhoek|Maputo|Lilongwe|Luanda|Yaoundé|Dakar|Khartoum|Tunis|Algiers|Tripoli|Beijing|Shanghai|Tokyo|Osaka|New Delhi|Mumbai|Bangalore|Brasilia|São Paulo|Moscow|St\.? Petersburg|Paris|Berlin|Munich|Madrid|Barcelona|Rome|Milan|Lisbon|Amsterdam|Brussels|Zurich|Geneva|Vienna|Stockholm|Oslo|Copenhagen|Helsinki|Warsaw|Athens|Istanbul|Ankara|Tel Aviv|Riyadh|Dubai|Doha|Tehran|Baghdad|Karachi|Lahore|Dhaka|Colombo|Bangkok|Hanoi|Manila|Jakarta|Kuala Lumpur|Singapore|Seoul|Pyongyang|Taipei|Sydney|Melbourne|Auckland|Wellington|Toronto|Vancouver|Ottawa|Mexico City|Buenos Aires|Santiago|Bogotá|Lima|Caracas|Havana|Kingston|Dublin|Edinburgh|Cardiff|Reykjavik))\b/g,
    // Geographic features
    /\b((?:Mount|Lake|River|Ocean|Sea|Gulf|Bay|Strait|Channel|Island|Peninsula|Desert|Valley|Plateau|Mountain|Forest)\s+[A-Z][a-zA-Z]+)\b/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const loc = match[1] ?? match[0];
      const context = getSurroundingText(text, match.index, 80);
      addEntity(map, loc, "location", context);
    }
  }
}

function extractDates(text: string, map: Map<string, ExtractedEntity>): void {
  const patterns: RegExp[] = [
    /\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\b/g,
    /\b(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})\b/g,
    /\b((?:1[0-9]|[2-9][0-9])\d{2})\b/g, // years 1000-9999
    /\b(\d{1,2}(?:st|nd|rd|th)\s+century)\b/gi,
    /\b((?:19|20)\d{2}s)\b/g, // decades
    /\b(BCE|CE|BC|AD)\b/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const date = match[1] ?? match[0];
      const context = getSurroundingText(text, match.index, 80);
      addEntity(map, date, "date", context);
    }
  }
}

function extractNumbers(text: string, map: Map<string, ExtractedEntity>): void {
  // Numbers with units
  const pattern = /\b(\d+(?:\.\d+)?(?:\s*(?:%|kg|g|m|cm|mm|km|ft|in|lb|oz|°C|°F|K|Hz|W|kW|MW|J|kJ|N|Pa|kPa|MPa|V|A|Ω|mol|L|mL|s|ms|min|hour|day|year|ppm|ppb|dB|rad|cal|kcal|eV|MeV|GeV|mol|ph|bar|atm|torr|lux|cd))\b)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const num = match[1];
    const context = getSurroundingText(text, match.index, 80);
    addEntity(map, num, "number", context);
  }
}

function extractLawsAndTheories(text: string, map: Map<string, ExtractedEntity>): void {
  const patterns: RegExp[] = [
    /\b(([A-Z][a-z]+)'s\s+(?:Law|Principle|Rule|Equation|Theorem|Lemma|Constant))\b/g,
    /\b((?:Theory|Law|Principle|Rule|Equation|Theorem)\s+of\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\b/g,
    /\b([A-Z][a-zA-Z]+\s+(?:Theory|Law|Principle|Effect|Paradox|Dilemma|Paradigm|Model|Framework))\b/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const law = match[1] ?? match[0];
      const context = getSurroundingText(text, match.index, 80);
      addEntity(map, law, "law", context);
    }
  }
}

function extractChemicals(text: string, map: Map<string, ExtractedEntity>): void {
  // Chemical formulas: H2O, NaCl, CO2, H2SO4, etc.
  const pattern = /\b([A-Z][a-z]?\d*(?:[A-Z][a-z]?\d*)+)\b/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const chem = match[1];
    // Must look like a chemical formula (has at least 2 elements or a number)
    if (!/\d/.test(chem) && /^[A-Z][a-z]?$/.test(chem)) continue;
    // Filter out common English words that match the pattern
    if (isCommonWord(chem)) continue;
    const context = getSurroundingText(text, match.index, 80);
    addEntity(map, chem, "chemical", context);
  }
}

function extractConcepts(text: string, map: Map<string, ExtractedEntity>): void {
  // Capitalized multi-word phrases that appear 2+ times
  const pattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4})\b/g;
  const candidates = new Map<string, number>();

  let match;
  while ((match = pattern.exec(text)) !== null) {
    const phrase = match[1];
    if (isCommonPhrase(phrase.toLowerCase())) continue;
    candidates.set(phrase, (candidates.get(phrase) ?? 0) + 1);
  }

  for (const [phrase, count] of candidates) {
    if (count >= 2) {
      const idx = text.indexOf(phrase);
      const context = getSurroundingText(text, idx, 80);
      addEntity(map, phrase, "concept", context);
    }
  }
}

function extractEquations(text: string, map: Map<string, ExtractedEntity>): void {
  const pattern = /\b((?:Equation|Formula|Expression)\s+(?:\d+|[A-Z][a-z]+))\b/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const eq = match[1];
    const context = getSurroundingText(text, match.index, 80);
    addEntity(map, eq, "equation", context);
  }
}

function extractUnits(text: string, map: Map<string, ExtractedEntity>): void {
  const units = ["m/s", "kg", "Newton", "Joule", "Watt", "Pascal", "Hertz", "Volt", "Ampere", "Ohm", "Coulomb", "Tesla", "Weber", "lumen", "candela", "mole", "Kelvin", "radian", "steradian", "decibel", "byte", "bit", "pixel"];
  for (const unit of units) {
    const regex = new RegExp(`\\b${unit}\\b`, "gi");
    let match;
    while ((match = regex.exec(text)) !== null) {
      const context = getSurroundingText(text, match.index, 80);
      addEntity(map, unit, "unit", context);
    }
  }
}

function extractKeyTerms(text: string, map: Map<string, ExtractedEntity>): void {
  // High-frequency content words that aren't already captured
  const tokens = tokenizeContent(text);
  const freq = new Map<string, number>();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) ?? 0) + 1);
  }

  // Add terms that appear 5+ times and aren't already entities
  for (const [term, count] of freq) {
    if (count >= 5 && !map.has(`term:${term}`)) {
      const idx = text.toLowerCase().indexOf(term);
      const context = idx >= 0 ? getSurroundingText(text, idx, 80) : "";
      map.set(`term:${term}`, {
        text: term,
        type: "term",
        frequency: count,
        contexts: [context],
        aliases: [],
      });
    }
  }
}

// ── Utilities ──

function getSurroundingText(text: string, index: number, radius: number): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  return text.slice(start, end).trim();
}

function isCommonPhrase(lower: string): boolean {
  const common = new Set([
    "the", "this", "that", "these", "those", "there", "here", "what", "which",
    "who", "whom", "whose", "when", "where", "why", "how", "all", "both",
    "each", "every", "some", "any", "many", "much", "more", "most", "less",
    "least", "few", "several", "such", "same", "other", "another", "certain",
    "united states", "united kingdom", "south africa", "new york", "new zealand",
    "san francisco", "los angeles", "high school", "middle school", "primary school",
    "first time", "second time", "last time", "next time", "every time",
    "one another", "each other", "one day", "next day", "last day",
    "figure shows", "table shows", "graph shows", "chart shows",
    "as shown", "as discussed", "as mentioned", "as described", "as explained",
    "for example", "for instance", "in addition", "in contrast", "in fact",
    "in general", "in particular", "in summary", "in conclusion", "in other words",
    "on the other hand", "at the same time", "in the same way",
    "the first", "the second", "the third", "the last", "the next",
    "the following", "the above", "the below", "the former", "the latter",
  ]);
  return common.has(lower);
}

function isCommonWord(word: string): boolean {
  const common = new Set([
    "Is", "It", "He", "We", "Us", "No", "So", "To", "Do", "Go", "An", "In", "On",
    "At", "Or", "As", "By", "Of", "If", "My", "Up", "Me", "Be", "Am",
  ]);
  return common.has(word);
}
