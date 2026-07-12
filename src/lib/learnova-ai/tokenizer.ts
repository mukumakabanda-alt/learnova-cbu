// ═══════════════════════════════════════════════════════════════════
// Learnova AI v2 — Advanced Tokenizer & NLP Pipeline
// Upgraded with: semantic tokenization, POS-like tagging,
// phrase chunking, co-occurrence analysis, and academic term detection.
// ═══════════════════════════════════════════════════════════════════

export const STOP_WORDS = new Set<string>([
  "a","an","the","and","or","but","nor","yet","so","for","as","than","that","whether","either","neither","though","although","because","since","unless","until","while","whereas","if","then","once",
  "in","on","at","to","of","by","with","from","into","onto","upon","about","above","across","after","against","along","among","around","before","behind","below","beneath","beside","between","beyond","during","except","inside","near","outside","over","through","throughout","toward","towards","under","underneath","within","without","via","per","amid","amongst",
  "i","me","my","myself","we","us","our","ours","ourselves","you","your","yours","yourself","yourselves","he","him","his","himself","she","her","hers","herself","it","its","itself","they","them","their","theirs","themselves","this","that","these","those","who","whom","whose","which","what","whatever","whoever","whomever","whichever",
  "is","am","are","was","were","be","been","being",
  "have","has","had","having","do","does","did","doing","done","will","would","shall","should","can","could","may","might","must","ought","need","dare","used",
  "not","no","yes","very","too","also","just","only","even","still","already","always","never","often","sometimes","usually","rarely","seldom","now","then","here","there","where","when","why","how","again","almost","enough","perhaps","maybe","indeed","however","moreover","furthermore","therefore","thus","hence","nevertheless","nonetheless","accordingly","consequently","otherwise","instead","rather","quite","really","actually","simply","particularly","especially","specifically","generally","basically","essentially","literally","figuratively","somewhat","somehow","anyway","anyhow","anywhere","somewhere","nowhere","everywhere",
  "some","any","all","both","each","every","few","many","much","most","more","less","least","several","such","same","other","another","certain","various","numerous","countless",
  "etc","ie","eg","ex","vs","pp","cf","al","et",
  "one","two","three","four","five","six","seven","eight","nine","ten","first","second","third","fourth","fifth",
]);

// Academic signal words — indicate important content follows
export const ACADEMIC_SIGNALS = new Set<string>([
  "important","notably","significantly","crucially","essentially","fundamentally","key","primary","critical",
  "however","conversely","nevertheless","nonetheless","despite","although","whereas","unlike",
  "therefore","consequently","thus","hence","accordingly","as_a_result","resulting",
  "furthermore","moreover","additionally","in_addition","also","besides",
  "for_example","for_instance","such_as","specifically","namely","including",
  "first","second","third","finally","lastly","subsequently","then","next",
  "in_contrast","on_the_other_hand","alternatively","rather",
  "defined","definition","refers","means","denotes","represents","describes",
  "because","since","due","owing","caused","results","leads","produces","generates",
  "must","requires","needs","depends","necessary","essential","mandatory","prerequisite",
  "hypothesis","theory","principle","law","theorem","lemma","corollary","postulate","axiom",
  "evidence","data","research","study","experiment","observation","analysis","result",
  "conclusion","summary","abstract","introduction","methodology","discussion",
]);

// POS-like word categories (simplified, no external library)
const MODAL_VERBS = new Set(["can","could","may","might","must","shall","should","will","would","ought","need","dare"]);
const INTENSIFIERS = new Set(["very","extremely","highly","deeply","strongly","particularly","especially","significantly","substantially","considerably","remarkably","notably","crucially","vitally","utterly","absolutely","entirely","completely","totally","fully","wholly"]);
const HEDGES = new Set(["perhaps","maybe","possibly","probably","likely","seemingly","apparently","arguably","presumably","supposedly","allegedly","ostensibly","potentially","conceivably","plausibly"]);
const CONNECTORS = new Set(["however","moreover","furthermore","therefore","thus","hence","consequently","nevertheless","nonetheless","accordingly","otherwise","meanwhile","subsequently","alternatively","conversely","whereas","although","because","since","unless","until"]);

export type WordCategory = "noun" | "verb" | "adjective" | "adverb" | "modal" | "intensifier" | "hedge" | "connector" | "signal" | "stop" | "content";

export interface TaggedToken {
  word: string;
  stem: string;
  category: WordCategory;
  isCapitalized: boolean;
  isAcademic: boolean;
  position: number;
}

/**
 * Split text into sentences with enhanced abbreviation handling.
 */
export function splitSentences(text: string): string[] {
  if (!text || !text.trim()) return [];

  const abbreviations: [RegExp, string][] = [
    [/\bMr\./g, "Mr<DOT>"],[/\bMrs\./g, "Mrs<DOT>"],[/\bMs\./g, "Ms<DOT>"],
    [/\bDr\./g, "Dr<DOT>"],[/\bProf\./g, "Prof<DOT>"],[/\bSr\./g, "Sr<DOT>"],
    [/\bJr\./g, "Jr<DOT>"],[/\bSt\./g, "St<DOT>"],[/\bvs\./g, "vs<DOT>"],
    [/\bi\.e\./g, "ie<DOT>"],[/\be\.g\./g, "eg<DOT>"],[/\betc\./g, "etc<DOT>"],
    [/\bU\.S\./g, "US<DOT>"],[/\bU\.K\./g, "UK<DOT>"],[/\bU\.N\./g, "UN<DOT>"],
    [/\bPh\.D\./g, "PhD<DOT>"],[/\bB\.Sc\./g, "BSc<DOT>"],[/\bM\.Sc\./g, "MSc<DOT>"],
    [/\bB\.A\./g, "BA<DOT>"],[/\bM\.A\./g, "MA<DOT>"],[/\bNo\./g, "No<DOT>"],
    [/\bvol\./g, "vol<DOT>"],[/\bFig\./g, "Fig<DOT>"],[/\bEq\./g, "Eq<DOT>"],
    [/\bRef\./g, "Ref<DOT>"],[/\bCh\./g, "Ch<DOT>"],[/\bSec\./g, "Sec<DOT>"],
    [/\bpp\./g, "pp<DOT>"],[/\bal\./g, "al<DOT>"],[/\bca\./g, "ca<DOT>"],
    [/\bcf\./g, "cf<DOT>"],[/\bapprox\./g, "approx<DOT>"],[/\bmax\./g, "max<DOT>"],
    [/\bmin\./g, "min<DOT>"],[/\bavg\./g, "avg<DOT>"],[/\bresp\./g, "resp<DOT>"],
    [/\bnr\./g, "nr<DOT>"],[/\bdept\./g, "dept<DOT>"],[/\binc\./g, "inc<DOT>"],
    [/\bltd\./g, "ltd<DOT>"],[/\bco\./g, "co<DOT>"],[/\bcorp\./g, "corp<DOT>"],
    // Protect formula subscripts/superscripts
    [/\b(\d+)\.(\d+)/g, "$1<DOT>$2"],
  ];

  let protected_text = text;
  for (const [pattern, replacement] of abbreviations) {
    protected_text = protected_text.replace(pattern, replacement);
  }

  // Protect decimal numbers
  protected_text = protected_text.replace(/(\d)\.(\d)/g, "$1<DOT>$2");

  // Protect formulas (text between $ signs — LaTeX inline math)
  protected_text = protected_text.replace(/\$([^$]+)\$/g, (match) =>
    match.replace(/\./g, "<DOT>"),
  );

  const raw = protected_text
    .replace(/([.!?])\s+(?=[A-Z""'(\[])/g, "$1<SPLIT>")
    .replace(/([.!?])\s*$/gm, "$1<SPLIT>")
    .split("<SPLIT>");

  return raw
    .map((s) => s.replace(/<DOT>/g, ".").trim())
    .filter((s) => s.length > 15);
}

/**
 * Tokenize into lowercase word tokens.
 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 1);
}

/**
 * Tokenize and remove stopwords.
 */
export function tokenizeContent(text: string): string[] {
  return tokenize(text).filter((w) => !STOP_WORDS.has(w) && w.length > 2);
}

/**
 * Enhanced Porter stemmer with additional suffix handling.
 */
export function stem(word: string): string {
  let w = word.toLowerCase().trim();
  if (w.length <= 3) return w;

  if (w.endsWith("sses")) w = w.slice(0, -2);
  else if (w.endsWith("ies")) w = w.slice(0, -2);
  else if (w.endsWith("ss")) {}
  else if (w.endsWith("s")) w = w.slice(0, -1);

  if (w.endsWith("eed")) { if (w.length > 4) w = w.slice(0, -1); }
  else if (w.endsWith("ed") && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith("ing") && w.length > 5) w = w.slice(0, -3);

  if (w.endsWith("y") && w.length > 3) w = w.slice(0, -1) + "i";

  const suffixes2: [string, string][] = [
    ["ational","ate"],["tional","tion"],["enci","ence"],["anci","ance"],
    ["izer","ize"],["abli","able"],["alli","al"],["entli","ent"],
    ["eli","e"],["ousli","ous"],["ization","ize"],["ation","ate"],
    ["ator","ate"],["alism","al"],["iveness","ive"],["fulness","ful"],
    ["ousness","ous"],["aliti","al"],["iviti","ive"],["biliti","ble"],
    ["logi","log"],["fulli","ful"],["lessli","less"],
  ];
  for (const [suffix, replacement] of suffixes2) {
    if (w.endsWith(suffix) && w.length > suffix.length + 2) { w = w.slice(0, -suffix.length) + replacement; break; }
  }

  const suffixes3: [string, string][] = [
    ["icate","ic"],["ative",""],["alize","al"],["iciti","ic"],
    ["ical","ic"],["ful",""],["ness",""],["ous",""],
  ];
  for (const [suffix, replacement] of suffixes3) {
    if (w.endsWith(suffix) && w.length > suffix.length + 2) { w = w.slice(0, -suffix.length) + replacement; break; }
  }

  const suffixes4 = ["al","ance","ence","er","ic","able","ible","ant","ement","ment","ent","ou","ism","ate","iti","ous","ive","ize","iti"];
  for (const suffix of suffixes4) {
    if (w.endsWith(suffix) && w.length > suffix.length + 3) { w = w.slice(0, -suffix.length); break; }
  }

  if (w.endsWith("e") && w.length > 4) w = w.slice(0, -1);

  // Additional: handle double letters from suffix removal
  if (w.length > 3 && /(.)\1$/.test(w) && !/(ll|ss|zz|ff)$/.test(w)) {
    w = w.slice(0, -1);
  }

  return w;
}

/**
 * Term frequency map.
 */
export function termFrequency(text: string): Map<string, number> {
  const terms = tokenizeContent(text).map(stem);
  const freq = new Map<string, number>();
  for (const term of terms) freq.set(term, (freq.get(term) ?? 0) + 1);
  return freq;
}

/**
 * Word count (content words only).
 */
export function wordCount(text: string): number {
  return tokenizeContent(text).length;
}

/**
 * Extract n-grams.
 */
export function extractNgrams(text: string, n: number): string[] {
  const tokens = tokenize(text);
  const result: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    const gram = tokens.slice(i, i + n);
    if (gram.some((t) => STOP_WORDS.has(t))) continue;
    result.push(gram.join(" "));
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════
// NEW v2: Semantic tokenization with POS-like tagging
// ═══════════════════════════════════════════════════════════════════

/**
 * Advanced tokenization that tags each word with a category.
 * Uses suffix-based heuristics for POS-like tagging (no external library).
 */
export function semanticTokenize(text: string): TaggedToken[] {
  const tokens = tokenize(text);
  const result: TaggedToken[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i];
    const lower = word.toLowerCase();
    const isCapitalized = word[0] !== lower[0];

    let category: WordCategory = "content";

    if (STOP_WORDS.has(lower)) category = "stop";
    else if (MODAL_VERBS.has(lower)) category = "modal";
    else if (INTENSIFIERS.has(lower)) category = "intensifier";
    else if (HEDGES.has(lower)) category = "hedge";
    else if (CONNECTORS.has(lower)) category = "connector";
    else if (ACADEMIC_SIGNALS.has(lower) || ACADEMIC_SIGNALS.has(lower.replace(/\s+/g, "_"))) category = "signal";
    else {
      // Suffix-based POS guess
      if (lower.endsWith("ly")) category = "adverb";
      else if (lower.endsWith("ous") || lower.endsWith("ful") || lower.endsWith("ive") || lower.endsWith("able") || lower.endsWith("ible") || lower.endsWith("al") || lower.endsWith("ic") || lower.endsWith("less")) category = "adjective";
      else if (lower.endsWith("ing") || lower.endsWith("ed") || lower.endsWith("ize") || lower.endsWith("ise") || lower.endsWith("ify") || lower.endsWith("ate")) category = "verb";
      else category = "noun";
    }

    result.push({
      word,
      stem: stem(lower),
      category,
      isCapitalized,
      isAcademic: ACADEMIC_SIGNALS.has(lower),
      position: i,
    });
  }

  return result;
}

/**
 * Extract phrase chunks — groups of consecutive content words.
 * These represent multi-word concepts (e.g., "machine learning algorithm").
 */
export function extractPhraseChunks(text: string, minLength: number = 2, maxLength: number = 5): string[] {
  const tagged = semanticTokenize(text);
  const phrases: string[] = [];
  let current: string[] = [];

  for (const token of tagged) {
    if (token.category === "noun" || token.category === "adjective") {
      current.push(token.word);
    } else {
      if (current.length >= minLength && current.length <= maxLength) {
        phrases.push(current.join(" "));
      }
      current = [];
    }
  }

  if (current.length >= minLength && current.length <= maxLength) {
    phrases.push(current.join(" "));
  }

  return phrases;
}

/**
 * Build a co-occurrence matrix — which words appear near each other.
 * Used for knowledge graph construction and concept clustering.
 */
export function coOccurrenceMatrix(text: string, windowSize: number = 5): Map<string, Map<string, number>> {
  const tokens = tokenizeContent(text);
  const matrix = new Map<string, Map<string, number>>();

  for (let i = 0; i < tokens.length; i++) {
    const w1 = stem(tokens[i]);
    if (!matrix.has(w1)) matrix.set(w1, new Map());

    for (let j = Math.max(0, i - windowSize); j < Math.min(tokens.length, i + windowSize + 1); j++) {
      if (i === j) continue;
      const w2 = stem(tokens[j]);
      const inner = matrix.get(w1)!;
      inner.set(w2, (inner.get(w2) ?? 0) + 1);
    }
  }

  return matrix;
}

/**
 * Count syllables in a word (for readability scoring).
 */
export function countSyllables(word: string): number {
  word = word.toLowerCase().trim();
  if (word.length <= 3) return 1;

  // Remove silent 'e'
  let w = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  w = w.replace(/^y/, "");

  const matches = w.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

/**
 * Check if a word is complex (3+ syllables, not a compound).
 */
export function isComplexWord(word: string): boolean {
  return countSyllables(word) >= 3;
}

/**
 * Detect the academic domain of text based on domain-specific vocabulary.
 */
export function detectDomain(text: string): string[] {
  const lower = text.toLowerCase();
  const domains: { name: string; keywords: string[]; score: number }[] = [
    { name: "mathematics", keywords: ["theorem","equation","proof","derivative","integral","matrix","vector","function","polynomial","calculus","algebra","geometry","trigonometry","logarithm","exponential","limit","convergence","differential","topology","manifold"], score: 0 },
    { name: "physics", keywords: ["force","energy","momentum","velocity","acceleration","gravity","quantum","relativity","thermodynamics","electromagnetic","particle","wave","frequency","wavelength","voltage","current","resistance","capacitance","magnetic","nuclear"], score: 0 },
    { name: "chemistry", keywords: ["molecule","atom","reaction","compound","element","bond","acid","base","oxidation","reduction","catalyst","polymer","organic","inorganic","stoichiometry","mole","solution","solvent","solute","periodic"], score: 0 },
    { name: "biology", keywords: ["cell","organism","evolution","genetics","dna","rna","protein","enzyme","membrane","mitosis","meiosis","photosynthesis","respiration","ecosystem","species","taxonomy","anatomy","physiology","bacteria","virus"], score: 0 },
    { name: "computer_science", keywords: ["algorithm","data","structure","program","software","hardware","database","network","protocol","compiler","complexity","recursion","iteration","variable","function","class","object","inheritance","polymorphism","encryption"], score: 0 },
    { name: "economics", keywords: ["market","demand","supply","price","cost","revenue","profit","inflation","gdp","monetary","fiscal","trade","investment","capital","labor","equilibrium","elasticity","surplus","deficit","currency"], score: 0 },
    { name: "law", keywords: ["statute","regulation","jurisdiction","liability","contract","tort","plaintiff","defendant","court","appeal","verdict","amendment","constitutional","statutory","precedent","jurisprudence","litigation","arbitration","mediation","tribunal"], score: 0 },
    { name: "medicine", keywords: ["patient","diagnosis","treatment","symptom","disease","therapy","medication","prescription","clinical","pathology","prognosis","etiology","anatomy","physiology","pharmacology","epidemiology","syndrome","chronic","acute","preventive"], score: 0 },
    { name: "engineering", keywords: ["design","system","component","circuit","signal","control","feedback","optimization","structural","mechanical","electrical","thermal","fluid","stress","strain","torque","efficiency","tolerance","specification","manufacturing"], score: 0 },
    { name: "psychology", keywords: ["behavior","cognitive","perception","memory","learning","motivation","emotion","consciousness","personality","developmental","social","clinical","abnormal","therapy","neuroscience","conditioning","stimulus","response","attitude","cognition"], score: 0 },
    { name: "history", keywords: ["century","empire","revolution","war","treaty","colonial","dynasty","civilization","ancient","medieval","renaissance","modern","independence","constitution","monarchy","parliament","democracy","imperialism","nationalism","cold_war"], score: 0 },
    { name: "literature", keywords: ["narrative","protagonist","antagonist","metaphor","simile","theme","symbolism","allegory","irony","foreshadowing","genre","poetry","prose","drama","sonnet","stanza","verse","characterization","plot","setting"], score: 0 },
  ];

  for (const domain of domains) {
    for (const kw of domain.keywords) {
      if (lower.includes(kw)) domain.score++;
    }
  }

  return domains
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((d) => d.name);
}
