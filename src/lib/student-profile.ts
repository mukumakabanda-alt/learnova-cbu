// Bridges the Learnova AI engine's student-memory system (see
// src/lib/learnova-ai/student-memory.ts) to persistent storage. There's
// no server-side table for this yet, so it lives in localStorage, keyed
// per signed-in user — good enough for one device, and exactly what
// serializeProfile/deserializeProfile were built for. If this ever needs
// to follow a student across devices, swap the two functions below for
// reads/writes against a new Supabase table; nothing that calls
// loadStudentProfile/saveStudentProfile would need to change.

import { LearnovaAI } from "@/lib/learnova-ai";
import type { StudentProfile } from "@/lib/learnova-ai/types";

const KEY_PREFIX = "learnova_student_profile_";

export function loadStudentProfile(userId: string, name: string): StudentProfile {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + userId);
    if (raw) return LearnovaAI.deserializeProfile(raw);
  } catch {
    // Corrupt JSON from a previous version, or storage unavailable
    // (private browsing) — fall through to a fresh profile rather than
    // breaking whatever the caller was trying to do.
  }
  return LearnovaAI.createStudentProfile(userId, name, []);
}

export function saveStudentProfile(profile: StudentProfile): void {
  try {
    localStorage.setItem(KEY_PREFIX + profile.id, LearnovaAI.serializeProfile(profile));
  } catch {
    // Storage full or unavailable — this session's quiz/download history
    // just won't carry over to the next visit. Nothing actionable to
    // show the person for it, so it fails quietly.
  }
}
