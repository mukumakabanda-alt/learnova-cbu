// ═══════════════════════════════════════════════════════════════════
// Learnova AI v3 — Student Memory & Adaptive Learning Engine
//
// Tracks student behavior, builds mastery profiles, identifies
// weaknesses, generates personalized study plans, and adapts
// recommendations to the individual student.
//
// This is the "personal study coach" — it studies the STUDENT.
// No external APIs. Pure TypeScript.
// ═══════════════════════════════════════════════════════════════════

import type {
  StudentProfile, QuizAttempt, FlashcardAttempt, StudySession,
  TopicMastery, AdaptiveRecommendation, StudyPlan, StudyPlanSession,
  StudentInsight, MaterialInfo, Recommendation,
} from "./types";

/**
 * Create a new empty student profile.
 */
export function createStudentProfile(id: string, name: string, courses: string[] = []): StudentProfile {
  return {
    id, name, courses,
    quizHistory: [], flashcardHistory: [], studySessions: [],
    topicMastery: new Map(), downloadHistory: [],
    timeSpentPerTopic: new Map(), revisionFrequency: new Map(),
    lastStudyDate: null, streakDays: 0,
    preferredDifficulty: "medium", preferredStudyTime: null,
    averageSessionLength: 0, weakTopics: [], strongTopics: [],
    neglectedTopics: [], recommendedDailyMinutes: 25,
    totalStudyMinutes: 0,
  };
}

/**
 * Record a quiz attempt and update the student profile.
 */
export function recordQuizAttempt(profile: StudentProfile, attempt: QuizAttempt): StudentProfile {
  profile.quizHistory.push(attempt);

  // Update topic mastery for each topic covered
  for (const topic of attempt.topicsCovered) {
    const mastery = profile.topicMastery.get(topic) ?? {
      topic, level: 0, attempts: 0, correctAttempts: 0,
      lastReviewed: null, daysSinceReview: 0, trend: "stable", relatedTopics: [],
    };

    mastery.attempts++;
    const scoreRatio = attempt.score / Math.max(attempt.total, 1);
    if (scoreRatio >= 0.7) mastery.correctAttempts++;

    // Update mastery level using exponential moving average
    const prevLevel = mastery.level;
    mastery.level = prevLevel * 0.7 + scoreRatio * 0.3;
    mastery.lastReviewed = attempt.date;
    mastery.daysSinceReview = daysSince(attempt.date);

    // Update trend
    if (mastery.level > prevLevel + 0.05) mastery.trend = "improving";
    else if (mastery.level < prevLevel - 0.05) mastery.trend = "declining";
    else mastery.trend = "stable";

    profile.topicMastery.set(topic, mastery);
  }

  // Update total study time
  profile.totalStudyMinutes += Math.ceil(attempt.timeSpent / 60);

  return updateProfileAnalysis(profile);
}

/**
 * Record a flashcard attempt.
 */
export function recordFlashcardAttempt(profile: StudentProfile, attempt: FlashcardAttempt): StudentProfile {
  profile.flashcardHistory.push(attempt);

  // Update topic mastery
  const mastery = profile.topicMastery.get(attempt.topic) ?? {
    topic: attempt.topic, level: 0, attempts: 0, correctAttempts: 0,
    lastReviewed: null, daysSinceReview: 0, trend: "stable", relatedTopics: [],
  };

  mastery.attempts++;
  if (attempt.correct) mastery.correctAttempts++;

  const prevLevel = mastery.level;
  mastery.level = prevLevel * 0.8 + (attempt.correct ? 1 : 0) * 0.2;
  mastery.lastReviewed = attempt.date;
  mastery.daysSinceReview = daysSince(attempt.date);

  if (mastery.level > prevLevel + 0.05) mastery.trend = "improving";
  else if (mastery.level < prevLevel - 0.05) mastery.trend = "declining";

  profile.topicMastery.set(attempt.topic, mastery);

  return updateProfileAnalysis(profile);
}

/**
 * Record a study session.
 */
export function recordStudySession(profile: StudentProfile, session: StudySession): StudentProfile {
  profile.studySessions.push(session);

  // Update streak
  const today = session.date;
  if (profile.lastStudyDate) {
    const gap = daysBetween(profile.lastStudyDate, today);
    if (gap === 1) profile.streakDays++;
    else if (gap > 1) profile.streakDays = 1;
  } else {
    profile.streakDays = 1;
  }
  profile.lastStudyDate = today;

  // Update time tracking
  profile.totalStudyMinutes += session.duration;
  for (const topic of session.topics) {
    profile.timeSpentPerTopic.set(topic, (profile.timeSpentPerTopic.get(topic) ?? 0) + session.duration);
    profile.revisionFrequency.set(topic, (profile.revisionFrequency.get(topic) ?? 0) + 1);
  }

  // Update average session length
  const totalSessions = profile.studySessions.length;
  profile.averageSessionLength = profile.totalStudyMinutes / totalSessions;

  // Learn preferred study time
  const hour = new Date(session.date).getHours();
  if (profile.preferredStudyTime === null) {
    profile.preferredStudyTime = hour;
  } else {
    // EMA update
    profile.preferredStudyTime = Math.round(profile.preferredStudyTime * 0.8 + hour * 0.2);
  }

  return updateProfileAnalysis(profile);
}

/**
 * Record a download.
 */
export function recordDownload(profile: StudentProfile, materialId: string): StudentProfile {
  profile.downloadHistory.push(materialId);
  return profile;
}

/**
 * Update the profile's analytical fields (weak/strong/neglected topics,
 * preferred difficulty, recommended daily minutes).
 */
function updateProfileAnalysis(profile: StudentProfile): StudentProfile {
  const masteryEntries = [...profile.topicMastery.entries()];

  // Classify topics
  profile.weakTopics = masteryEntries
    .filter(([, m]) => m.level < 0.5 && m.attempts >= 2)
    .map(([t]) => t)
    .sort((a, b) => (profile.topicMastery.get(a)!.level) - (profile.topicMastery.get(b)!.level));

  profile.strongTopics = masteryEntries
    .filter(([, m]) => m.level >= 0.75 && m.attempts >= 2)
    .map(([t]) => t)
    .sort((a, b) => (profile.topicMastery.get(b)!.level) - (profile.topicMastery.get(a)!.level));

  // Neglected: topics not reviewed in 6+ days with mastery < 0.7
  profile.neglectedTopics = masteryEntries
    .filter(([, m]) => m.daysSinceReview >= 6 && m.level < 0.7 && m.attempts >= 1)
    .map(([t]) => t)
    .sort((a, b) => profile.topicMastery.get(a)!.daysSinceReview - profile.topicMastery.get(b)!.daysSinceReview);

  // Determine preferred difficulty from recent quiz performance
  const recentQuizzes = profile.quizHistory.slice(-5);
  if (recentQuizzes.length > 0) {
    const avgScore = recentQuizzes.reduce((sum, q) => sum + q.score / Math.max(q.total, 1), 0) / recentQuizzes.length;
    if (avgScore >= 0.8) profile.preferredDifficulty = "hard";
    else if (avgScore >= 0.5) profile.preferredDifficulty = "medium";
    else profile.preferredDifficulty = "easy";
  }

  // Adaptive daily recommendation
  if (profile.neglectedTopics.length > 3) {
    profile.recommendedDailyMinutes = 35; // needs more review
  } else if (profile.weakTopics.length > 2) {
    profile.recommendedDailyMinutes = 30;
  } else if (profile.streakDays >= 7) {
    profile.recommendedDailyMinutes = 20; // on a roll, keep it light
  } else {
    profile.recommendedDailyMinutes = 25;
  }

  return profile;
}

/**
 * Generate adaptive recommendations for a student.
 * Combines mastery data with material catalog to suggest what to study next.
 */
export function generateAdaptiveRecommendations(
  profile: StudentProfile,
  materials: MaterialInfo[],
): AdaptiveRecommendation[] {
  const recommendations: AdaptiveRecommendation[] = [];

  // 1. CRITICAL: Neglected topics that are weakening
  for (const topic of profile.neglectedTopics.slice(0, 3)) {
    const material = findMaterialForTopic(topic, materials, profile);
    if (material) {
      const mastery = profile.topicMastery.get(topic);
      recommendations.push({
        materialId: material.id,
        title: material.title,
        reason: `You haven't revised "${topic}" in ${mastery?.daysSinceReview ?? 6} days. Your mastery is at ${Math.round((mastery?.level ?? 0) * 100)}%.`,
        priority: "critical",
        type: "review",
        estimatedTime: 15,
        topics: [topic],
        difficulty: profile.preferredDifficulty,
        rationale: `Spaced repetition: reviewing ${topic} now will prevent knowledge decay. Optimal review interval was ${mastery?.daysSinceReview ?? 6} days ago.`,
      });
    }
  }

  // 2. HIGH: Weak topics that need remediation
  for (const topic of profile.weakTopics.slice(0, 3)) {
    if (profile.neglectedTopics.includes(topic)) continue; // already recommended
    const material = findMaterialForTopic(topic, materials, profile);
    if (material) {
      const mastery = profile.topicMastery.get(topic);
      recommendations.push({
        materialId: material.id,
        title: material.title,
        reason: `You're struggling with "${topic}" (${Math.round((mastery?.level ?? 0) * 100)}% mastery). Let's strengthen this area.`,
        priority: "high",
        type: "remediate",
        estimatedTime: 25,
        topics: [topic],
        difficulty: "easy", // start easy to build confidence
        rationale: `Targeted practice: your accuracy on ${topic} is ${Math.round(((mastery?.correctAttempts ?? 0) / Math.max(mastery?.attempts ?? 1, 1)) * 100)}%. Starting with easier content to build foundational understanding.`,
      });
    }
  }

  // 3. MEDIUM: New topics related to strong areas (advance)
  for (const topic of profile.strongTopics.slice(0, 2)) {
    const material = findAdvancedMaterialForTopic(topic, materials, profile);
    if (material) {
      recommendations.push({
        materialId: material.id,
        title: material.title,
        reason: `You've mastered "${topic}" — ready to advance to related content.`,
        priority: "medium",
        type: "advance",
        estimatedTime: 30,
        topics: [topic],
        difficulty: "hard",
        rationale: `Advancement: since you've achieved ${Math.round((profile.topicMastery.get(topic)?.level ?? 0) * 100)}% mastery on ${topic}, challenging yourself with advanced material will deepen understanding.`,
      });
    }
  }

  // 4. LOW: Explore new topics
  const unexploredTopics = materials
    .flatMap((m) => m.tags ?? [])
    .filter((tag) => !profile.topicMastery.has(tag))
    .filter((tag, i, arr) => arr.indexOf(tag) === i)
    .slice(0, 3);

  for (const topic of unexploredTopics) {
    const material = findMaterialForTopic(topic, materials, profile);
    if (material) {
      recommendations.push({
        materialId: material.id,
        title: material.title,
        reason: `Explore something new: "${topic}" appears in your course materials but you haven't studied it yet.`,
        priority: "low",
        type: "explore",
        estimatedTime: 20,
        topics: [topic],
        difficulty: "medium",
        rationale: `Discovery: broadening your knowledge base with ${topic} will give you a more complete understanding of the subject.`,
      });
    }
  }

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  return recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

/**
 * Generate a personalized daily study plan.
 */
export function generateStudyPlan(
  profile: StudentProfile,
  materials: MaterialInfo[],
  date: string = new Date().toISOString(),
): StudyPlan {
  const recs = generateAdaptiveRecommendations(profile, materials);
  const sessions: StudyPlanSession[] = [];
  let totalMinutes = 0;
  let order = 1;

  // Warmup: quick review of a strong topic (confidence builder)
  if (profile.strongTopics.length > 0) {
    const warmupTopic = profile.strongTopics[0];
    const material = findMaterialForTopic(warmupTopic, materials, profile);
    sessions.push({
      order: order++,
      type: "warmup",
      materialId: material?.id ?? null,
      title: `Quick review: ${warmupTopic}`,
      duration: 5,
      topics: [warmupTopic],
      reason: "Start with something you're good at to build momentum.",
    });
    totalMinutes += 5;
  }

  // Main sessions from adaptive recommendations
  for (const rec of recs.slice(0, 4)) {
    if (totalMinutes >= profile.recommendedDailyMinutes) break;
    const sessionDuration = Math.min(rec.estimatedTime, profile.recommendedDailyMinutes - totalMinutes);

    sessions.push({
      order: order++,
      type: rec.type === "review" ? "review" : rec.type === "remediate" ? "learn" : rec.type === "advance" ? "learn" : "practice",
      materialId: rec.materialId,
      title: rec.title,
      duration: sessionDuration,
      topics: rec.topics,
      reason: rec.reason,
    });
    totalMinutes += sessionDuration;
  }

  // Cooldown: flashcard practice
  if (totalMinutes < profile.recommendedDailyMinutes + 5) {
    sessions.push({
      order: order++,
      type: "cooldown",
      materialId: null,
      title: "Flashcard practice",
      duration: 5,
      topics: profile.weakTopics.slice(0, 3),
      reason: "End with quick flashcards to consolidate learning.",
    });
    totalMinutes += 5;
  }

  // Determine focus and goal
  const focus = profile.neglectedTopics[0] ?? profile.weakTopics[0] ?? "general study";
  const goal = profile.neglectedTopics.length > 0
    ? `Catch up on ${profile.neglectedTopics.length} neglected topics`
    : profile.weakTopics.length > 0
      ? `Improve ${profile.weakTopics.length} weak areas`
      : "Maintain and advance your knowledge";

  return { date, totalMinutes, sessions, focus, goal };
}

/**
 * Generate insights about the student's learning patterns.
 */
export function generateStudentInsights(profile: StudentProfile): StudentInsight[] {
  const insights: StudentInsight[] = [];

  // Strengths
  for (const topic of profile.strongTopics.slice(0, 3)) {
    const mastery = profile.topicMastery.get(topic);
    insights.push({
      type: "strength",
      title: `Strong: ${topic}`,
      description: `You've achieved ${Math.round((mastery?.level ?? 0) * 100)}% mastery on ${topic} across ${mastery?.attempts ?? 0} attempts. Your performance is ${mastery?.trend}.`,
      actionable: true,
      action: `Ready to advance to harder content on ${topic}?`,
      priority: "info",
    });
  }

  // Weaknesses
  for (const topic of profile.weakTopics.slice(0, 3)) {
    const mastery = profile.topicMastery.get(topic);
    insights.push({
      type: "weakness",
      title: `Needs work: ${topic}`,
      description: `Your mastery on ${topic} is ${Math.round((mastery?.level ?? 0) * 100)}%. You've gotten ${mastery?.correctAttempts ?? 0} out of ${mastery?.attempts ?? 0} attempts correct.`,
      actionable: true,
      action: `Schedule a focused study session on ${topic}.`,
      priority: "high",
    });
  }

  // Neglected topics warning
  for (const topic of profile.neglectedTopics.slice(0, 2)) {
    const mastery = profile.topicMastery.get(topic);
    insights.push({
      type: "warning",
      title: `Neglected: ${topic}`,
      description: `You haven't reviewed ${topic} in ${mastery?.daysSinceReview ?? 0} days. Knowledge decay starts after 6 days without review.`,
      actionable: true,
      action: `Do a quick 10-minute review of ${topic} today.`,
      priority: "high",
    });
  }

  // Streak achievement
  if (profile.streakDays >= 7) {
    insights.push({
      type: "achievement",
      title: `${profile.streakDays}-day streak!`,
      description: `You've studied every day for ${profile.streakDays} consecutive days. Keep it up!`,
      actionable: false,
      action: null,
      priority: "info",
    });
  }

  // Study time pattern
  if (profile.preferredStudyTime !== null) {
    const hour = profile.preferredStudyTime;
    const period = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
    insights.push({
      type: "pattern",
      title: `You're a ${period} studier`,
      description: `You tend to study around ${hour}:00. Your average session is ${Math.round(profile.averageSessionLength)} minutes.`,
      actionable: true,
      action: `Try studying at ${hour}:00 for optimal focus.`,
      priority: "low",
    });
  }

  // Suggestion for improvement
  if (profile.weakTopics.length > 3) {
    insights.push({
      type: "suggestion",
      title: "Focus strategy",
      description: `You have ${profile.weakTopics.length} weak topics. Rather than spreading your time, focus on 1-2 per session for deeper learning.`,
      actionable: true,
      action: "Pick one weak topic to focus on today.",
      priority: "medium",
    });
  }

  return insights;
}

// ── Utility functions ──

function findMaterialForTopic(topic: string, materials: MaterialInfo[], profile: StudentProfile): MaterialInfo | null {
  const topicLower = topic.toLowerCase();
  // Prefer materials not already downloaded
  const candidates = materials.filter((m) => {
    const tags = (m.tags ?? []).map((t) => t.toLowerCase());
    const titleMatch = m.title.toLowerCase().includes(topicLower);
    const tagMatch = tags.some((t) => t.includes(topicLower) || topicLower.includes(t));
    const summaryMatch = m.summary?.toLowerCase().includes(topicLower);
    return titleMatch || tagMatch || summaryMatch;
  });

  // Prefer not-yet-downloaded materials
  const notDownloaded = candidates.filter((m) => !profile.downloadHistory.includes(m.id));
  return notDownloaded[0] ?? candidates[0] ?? null;
}

function findAdvancedMaterialForTopic(topic: string, materials: MaterialInfo[], profile: StudentProfile): MaterialInfo | null {
  const topicLower = topic.toLowerCase();
  // Find materials that mention the topic but aren't the ones already studied
  const studiedIds = new Set(profile.studySessions.map((s) => s.materialId));
  const candidates = materials.filter((m) => {
    if (studiedIds.has(m.id)) return false;
    const tags = (m.tags ?? []).map((t) => t.toLowerCase());
    return tags.some((t) => t.includes(topicLower)) || m.title.toLowerCase().includes(topicLower);
  });
  return candidates[0] ?? null;
}

function daysSince(dateStr: string): number {
  const date = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

function daysBetween(dateStr1: string, dateStr2: string): number {
  const d1 = new Date(dateStr1);
  const d2 = new Date(dateStr2);
  return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Serialize a student profile to JSON (for storage in localStorage/Supabase).
 */
export function serializeProfile(profile: StudentProfile): string {
  return JSON.stringify({
    ...profile,
    topicMastery: [...profile.topicMastery.entries()],
    timeSpentPerTopic: [...profile.timeSpentPerTopic.entries()],
    revisionFrequency: [...profile.revisionFrequency.entries()],
  });
}

/**
 * Deserialize a student profile from JSON.
 */
export function deserializeProfile(json: string): StudentProfile {
  const raw = JSON.parse(json);
  return {
    ...raw,
    topicMastery: new Map(raw.topicMastery),
    timeSpentPerTopic: new Map(raw.timeSpentPerTopic),
    revisionFrequency: new Map(raw.revisionFrequency),
  };
}
