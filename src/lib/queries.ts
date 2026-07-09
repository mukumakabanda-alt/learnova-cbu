import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

// ── Programmes & courses ───────────────────────────────────────────────
export function useProgrammes() {
  return useQuery({
    queryKey: ["programmes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("programmes").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useCourses(filters?: { programmeCode?: string | null; year?: number | null }) {
  return useQuery({
    queryKey: ["courses", filters],
    queryFn: async () => {
      let q = supabase.from("courses").select("*, programmes(name, school)").order("code");
      if (filters?.programmeCode) q = q.eq("programme_code", filters.programmeCode);
      if (filters?.year) q = q.eq("year", filters.year);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useCourse(code: string) {
  return useQuery({
    queryKey: ["course", code],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("*, programmes(name, school)")
        .ilike("code", code.replace(/-/g, " "))
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!code,
  });
}

export function useSearchCourses(query: string) {
  return useQuery({
    queryKey: ["search-courses", query],
    queryFn: async () => {
      if (!query.trim()) {
        const { data, error } = await supabase.from("courses").select("*, programmes(name, school)").order("code");
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from("courses")
        .select("*, programmes(name, school)")
        .or(`code.ilike.%${query}%,title.ilike.%${query}%,lecturer.ilike.%${query}%`);
      if (error) throw error;
      return data;
    },
  });
}

// ── Materials (the catalog) ────────────────────────────────────────────
export function useMaterialsForCourse(courseCode: string) {
  return useQuery({
    queryKey: ["materials", "course", courseCode],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("materials")
        .select("*")
        .eq("course_code", courseCode)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!courseCode,
  });
}

// The catalog hub: every ready-to-study material across all courses.
export function useCatalog(search?: string) {
  return useQuery({
    queryKey: ["catalog", search],
    queryFn: async () => {
      let q = supabase
        .from("materials")
        .select("*, courses(title, code)")
        .in("status", ["ready", "processing"])
        .order("created_at", { ascending: false });
      if (search?.trim()) q = q.ilike("title", `%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useMaterial(id: string) {
  return useQuery({
    queryKey: ["material", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("materials").select("*, courses(title, code)").eq("id", id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
    // Poll while the AI pipeline is still running so the UI flips to
    // "ready" on its own without the user refreshing.
    refetchInterval: (query) => (query.state.data?.status === "processing" ? 3000 : false),
  });
}

export function useFlashcards(materialId: string) {
  return useQuery({
    queryKey: ["flashcards", materialId],
    queryFn: async () => {
      const { data, error } = await supabase.from("flashcards").select("*").eq("material_id", materialId).order("position");
      if (error) throw error;
      return data;
    },
    enabled: !!materialId,
  });
}

export function useQuizQuestions(materialId: string) {
  return useQuery({
    queryKey: ["quiz", materialId],
    queryFn: async () => {
      const { data, error } = await supabase.from("quiz_questions").select("*").eq("material_id", materialId).order("position");
      if (error) throw error;
      return data;
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
    queryFn: async () => {
      const { data, error } = await supabase
        .from("material_requests")
        .select("*, courses(title)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

// ── Saved materials ───────────────────────────────────────────────────
export function useSavedMaterials() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["saved-materials", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saved_materials")
        .select("material_id, materials(*, courses(title, code))")
        .eq("profile_id", user!.id);
      if (error) throw error;
      return data;
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
        if (error) throw error;
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

// ── Admin: catalogue a new course material (no file, metadata only) ────
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
