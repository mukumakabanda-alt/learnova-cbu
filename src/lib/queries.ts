import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";

type ProgrammeRow = Database["public"]["Tables"]["programmes"]["Row"];
type CourseRow = Database["public"]["Tables"]["courses"]["Row"];
type MaterialRow = Database["public"]["Tables"]["materials"]["Row"];
type FlashcardRow = Database["public"]["Tables"]["flashcards"]["Row"];
type QuizRow = Database["public"]["Tables"]["quiz_questions"]["Row"];
type RequestRow = Database["public"]["Tables"]["material_requests"]["Row"];
type SavedRow = Database["public"]["Tables"]["saved_materials"]["Row"];

type CourseWithProgramme = CourseRow & { programmes: { name: string; school: string } | null };
type MaterialWithCourse = MaterialRow & { courses: { title: string; code: string } | null };
type RequestWithCourse = RequestRow & { courses: { title: string } | null };
type SavedWithMaterial = SavedRow & { materials: MaterialWithCourse | null };

// ── Programmes & courses ───────────────────────────────────────────────
export function useProgrammes() {
  return useQuery({
    queryKey: ["programmes"],
    queryFn: async (): Promise<ProgrammeRow[]> => {
      const { data, error } = await supabase.from("programmes").select("*").neq("code", "ADMIN").order("name");
      if (error) throw error;
      return (data ?? []) as ProgrammeRow[];
    },
  });
}

export function useCourses(filters?: { programmeCode?: string | null; year?: number | null }) {
  return useQuery({
    queryKey: ["courses", filters],
    queryFn: async (): Promise<CourseWithProgramme[]> => {
      let q = supabase.from("courses").select("*, programmes(name, school)").order("code");
      if (filters?.programmeCode) q = q.eq("programme_code", filters.programmeCode);
      if (filters?.year) q = q.eq("year", filters.year);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CourseWithProgramme[];
    },
  });
}

export function useCourse(code: string) {
  return useQuery({
    queryKey: ["course", code],
    queryFn: async (): Promise<CourseWithProgramme | null> => {
      const { data, error } = await supabase
        .from("courses")
        .select("*, programmes(name, school)")
        .ilike("code", code.replace(/-/g, " "))
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as CourseWithProgramme | null;
    },
    enabled: !!code,
  });
}

// Course search. Deliberately filters client-side rather than building a
// dynamic PostgREST `.or(...)` filter string out of the raw query: that
// approach broke silently the moment a search contained a comma or
// parenthesis (both totally normal to type), because those characters have
// special meaning in PostgREST's filter syntax. Client-side filtering also
// lets us match on `topics` (a text array — the homepage's own "Try IFRS"
// example is a topic tag, not a code/title/lecturer) and `description`,
// which the old server-side filter never covered at all. The course
// catalog is small (tens to low hundreds of rows for a single university),
// so fetching it once and filtering in memory is simple and correct; if
// this ever needs to scale to thousands of courses, move to a Postgres
// `tsvector` full-text index instead of hand-rolling filter strings again.
export function useSearchCourses(query: string) {
  return useQuery({
    queryKey: ["search-courses", query],
    queryFn: async (): Promise<CourseWithProgramme[]> => {
      const { data, error } = await supabase
        .from("courses")
        .select("*, programmes(name, school)")
        .order("code");
      if (error) throw error;
      const all = (data ?? []) as CourseWithProgramme[];

      const needle = query.trim().toLowerCase();
      if (!needle) return all;

      return all.filter((c) => {
        const haystacks = [c.code, c.title, c.lecturer ?? "", c.description ?? "", ...(c.topics ?? [])];
        return haystacks.some((h) => h.toLowerCase().includes(needle));
      });
    },
  });
}

// ── Materials ─────────────────────────────────────────────────────────
export function useMaterialsForCourse(courseCode: string) {
  return useQuery({
    queryKey: ["materials", "course", courseCode],
    queryFn: async (): Promise<MaterialRow[]> => {
      const { data, error } = await supabase
        .from("materials")
        .select("*")
        .eq("course_code", courseCode)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MaterialRow[];
    },
    enabled: !!courseCode,
  });
}

export function useCatalog(search?: string) {
  return useQuery({
    queryKey: ["catalog", search],
    queryFn: async (): Promise<MaterialWithCourse[]> => {
      let q = supabase
        .from("materials")
        .select("*, courses(title, code)")
        .in("status", ["ready", "processing"])
        .order("created_at", { ascending: false });
      if (search?.trim()) q = q.ilike("title", `%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as MaterialWithCourse[];
    },
  });
}

export function useMaterial(id: string) {
  return useQuery({
    queryKey: ["material", id],
    queryFn: async (): Promise<MaterialWithCourse | null> => {
      const { data, error } = await supabase.from("materials").select("*, courses(title, code)").eq("id", id).maybeSingle();
      if (error) throw error;
      return (data ?? null) as MaterialWithCourse | null;
    },
    enabled: !!id,
    refetchInterval: (query) => (query.state.data?.status === "processing" ? 3000 : false),
  });
}

export function useFlashcards(materialId: string) {
  return useQuery({
    queryKey: ["flashcards", materialId],
    queryFn: async (): Promise<FlashcardRow[]> => {
      const { data, error } = await supabase.from("flashcards").select("*").eq("material_id", materialId).order("position");
      if (error) throw error;
      return (data ?? []) as FlashcardRow[];
    },
    enabled: !!materialId,
  });
}

export function useQuizQuestions(materialId: string) {
  return useQuery({
    queryKey: ["quiz", materialId],
    queryFn: async (): Promise<QuizRow[]> => {
      const { data, error } = await supabase.from("quiz_questions").select("*").eq("material_id", materialId).order("position");
      if (error) throw error;
      return (data ?? []) as QuizRow[];
    },
    enabled: !!materialId,
  });
}

// ── Requests ────────────────────────────────────────────────────────────
export function useCreateRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { title: string; courseCode?: string | null; notes?: string; requestedBy: string }) => {
      const { error } = await supabase.from("material_requests").insert({
        title: input.title,
        course_code: input.courseCode ?? null,
        notes: input.notes ?? null,
        requested_by: input.requestedBy,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["requests"] }),
  });
}

export function useOpenRequests() {
  return useQuery({
    queryKey: ["requests"],
    queryFn: async (): Promise<RequestWithCourse[]> => {
      const { data, error } = await supabase
        .from("material_requests")
        .select("*, courses(title)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RequestWithCourse[];
    },
  });
}

// ── Saved materials ───────────────────────────────────────────────────
export function useSavedMaterials() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["saved-materials", user?.id],
    queryFn: async (): Promise<SavedWithMaterial[]> => {
      const { data, error } = await supabase
        .from("saved_materials")
        .select("material_id, materials(*, courses(title, code))")
        .eq("profile_id", user!.id);
      if (error) throw error;
      return (data ?? []) as SavedWithMaterial[];
    },
    enabled: !!user,
  });
}

export function useToggleSaved() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ materialId, save }: { materialId: string; save: boolean }) => {
      if (!user) throw new Error("Sign in to save materials");
      if (save) {
        const { error } = await supabase.from("saved_materials").insert({ profile_id: user.id, material_id: materialId });
        // Postgres code 23505 = unique_violation. A fast double-tap can fire
        // this same insert twice before the UI re-renders with the "saved"
        // state — the row already existing is not a real failure from the
        // user's point of view, so don't surface it as one.
        if (error && error.code !== "23505") throw error;
      } else {
        const { error } = await supabase.from("saved_materials").delete().eq("profile_id", user.id).eq("material_id", materialId);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-materials"] }),
  });
}

// ── Streak ──────────────────────────────────────────────────────────────
export function useBumpStreak() {
  const { user, refreshProfile } = useAuth();
  return useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase.rpc("bump_streak", { p_profile_id: user.id });
      if (error) throw error;
    },
    onSuccess: () => refreshProfile(),
  });
}

// ── Admin ─────────────────────────────────────────────────────────────
export function useCreateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      code: string; title: string; programmeCode: string; year: number; semester: 1 | 2; lecturer?: string; description?: string;
    }) => {
      const { error } = await supabase.from("courses").insert({
        code: input.code, title: input.title, programme_code: input.programmeCode,
        year: input.year, semester: input.semester, lecturer: input.lecturer, description: input.description ?? "",
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses"] }),
  });
}
