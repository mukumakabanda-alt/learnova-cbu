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
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type UserRoleRow = Database["public"]["Tables"]["user_roles"]["Row"];
type HeroSlideRow = Database["public"]["Tables"]["hero_slides"]["Row"];

export type CourseWithProgramme = CourseRow & { programmes: { name: string; school: string } | null };
export type MaterialWithCourse = MaterialRow & {
  courses: { title: string; code: string } | null;
  uploader?: { full_name: string } | null;
};
type RequestWithCourse = RequestRow & { courses: { title: string } | null };
type SavedWithMaterial = SavedRow & { materials: MaterialWithCourse | null };
export type HeroSlide = HeroSlideRow & { url: string };

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
        .in("status", ["ready", "processing", "catalog_only"])
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

// Powers two things on the study page from one query: "similar past
// papers for this course" (pass type: "Past Paper") and "popular in this
// course" (no type filter). Ordered by download_count first so genuinely
// well-used material surfaces before merely-recent material.
export function useRelatedMaterials(
  courseCode: string | null | undefined,
  options: { excludeId?: string; type?: string; limit?: number } = {},
) {
  const { excludeId, type, limit = 6 } = options;
  return useQuery({
    queryKey: ["related-materials", courseCode, type, excludeId, limit],
    queryFn: async (): Promise<MaterialRow[]> => {
      if (!courseCode) return [];
      let q = supabase
        .from("materials")
        .select("*")
        .eq("course_code", courseCode)
        .in("status", ["ready", "catalog_only"])
        .order("download_count", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit + 1); // +1 so we still have `limit` results after excluding the current one
      if (type) q = q.eq("type", type);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as MaterialRow[]).filter((m) => m.id !== excludeId).slice(0, limit);
    },
    enabled: !!courseCode,
  });
}

// Fire-and-forget counter bump on download. Uses a SECURITY DEFINER RPC
// (see supabase/migrations/0003_study_upgrade.sql) rather than an UPDATE,
// because the materials RLS policy only allows a row's owner/admin to
// UPDATE it — direct updates would silently no-op for every other student.
export function useIncrementDownload() {
  return useMutation({
    mutationFn: async (materialId: string) => {
      const { error } = await supabase.rpc("increment_download_count", { p_material_id: materialId });
      if (error) throw error;
    },
  });
}

// Recommended YouTube videos for a document — see
// supabase/functions/youtube-recommendations. Soft-fails to an empty list
// (never throws), since this is a nice-to-have that should never block or
// visibly break the study page if the API key isn't configured yet.
export function useYoutubeRecommendations(query: string | null | undefined) {
  return useQuery({
    queryKey: ["youtube-recommendations", query],
    queryFn: async (): Promise<{ videoId: string; title: string; channelTitle: string; thumbnail: string | null }[]> => {
      const { data, error } = await supabase.functions.invoke("youtube-recommendations", { body: { query } });
      if (error) return [];
      return data?.videos ?? [];
    },
    enabled: !!query?.trim(),
    staleTime: 1000 * 60 * 60, // an hour — these don't need to feel "live"
    retry: false,
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
  const { user, isAdmin } = useAuth();
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
    enabled: !!user && isAdmin,
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

// Edit an EXISTING course's outline (title, lecturer, description,
// topics, programme, year/semester) — the admin panel previously could
// only create new courses, never touch ones already in the catalogue.
export function useUpdateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      code: string;
      title?: string;
      programmeCode?: string;
      year?: number;
      semester?: 1 | 2;
      lecturer?: string | null;
      description?: string;
      topics?: string[];
    }) => {
      const { code, programmeCode, ...rest } = input;
      const { error } = await supabase
        .from("courses")
        .update({ ...rest, ...(programmeCode !== undefined ? { programme_code: programmeCode } : {}) })
        .eq("code", code);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses"] }),
  });
}

export function useDeleteCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const { error } = await supabase.from("courses").delete().eq("code", code);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses"] }),
  });
}

// ── Admin: materials manager ───────────────────────────────────────────
// Every material regardless of status — the public useCatalog() hook
// deliberately excludes anything an ordinary visitor shouldn't see, but
// an admin managing the catalogue needs to see (and fix) failed uploads
// too, which is exactly what the "Owners and admins view all their
// materials" RLS policy (see the new migration) now allows.
export function useAdminMaterials() {
  const { isAdmin } = useAuth();
  return useQuery({
    queryKey: ["admin-materials"],
    queryFn: async (): Promise<MaterialWithCourse[]> => {
      const { data, error } = await supabase
        .from("materials")
        .select("*, courses(title, code)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MaterialWithCourse[];
    },
    enabled: isAdmin,
  });
}

export function useUpdateMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      title?: string;
      type?: string;
      course_code?: string | null;
      content_year?: number | null;
    }) => {
      const { id, ...fields } = input;
      const { error } = await supabase.from("materials").update(fields).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-materials"] });
      qc.invalidateQueries({ queryKey: ["catalog"] });
    },
  });
}

export function useDeleteMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (material: { id: string; file_path: string | null }) => {
      if (material.file_path) {
        await supabase.storage.from("materials").remove([material.file_path]);
      }
      const { error } = await supabase.from("materials").delete().eq("id", material.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-materials"] });
      qc.invalidateQueries({ queryKey: ["catalog"] });
    },
  });
}

// ── Admin: hero carousel ────────────────────────────────────────────────
// Reads from the hero_slides table + 'hero-images' storage bucket (see
// the new migration). Falls back to nothing here if empty — the
// component itself decides what to show when there are zero rows.
export function useHeroSlides() {
  return useQuery({
    queryKey: ["hero-slides"],
    queryFn: async (): Promise<HeroSlide[]> => {
      const { data, error } = await supabase.from("hero_slides").select("*").order("position");
      if (error) throw error;
      return (data ?? []).map((s) => ({
        ...s,
        url: supabase.storage.from("hero-images").getPublicUrl(s.image_path).data.publicUrl,
      }));
    },
  });
}

export function useAddHeroSlide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const path = `${crypto.randomUUID()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("hero-images").upload(path, file);
      if (uploadError) throw uploadError;
      const { data: existing } = await supabase
        .from("hero_slides")
        .select("position")
        .order("position", { ascending: false })
        .limit(1);
      const nextPosition = (existing?.[0]?.position ?? -1) + 1;
      const { error } = await supabase.from("hero_slides").insert({ image_path: path, position: nextPosition });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hero-slides"] }),
  });
}

export function useDeleteHeroSlide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (slide: { id: string; image_path: string }) => {
      await supabase.storage.from("hero-images").remove([slide.image_path]);
      const { error } = await supabase.from("hero_slides").delete().eq("id", slide.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hero-slides"] }),
  });
}

// Swaps two slides' positions — used by the up/down reorder buttons.
export function useReorderHeroSlide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ a, b }: { a: { id: string; position: number }; b: { id: string; position: number } }) => {
      await Promise.all([
        supabase.from("hero_slides").update({ position: b.position }).eq("id", a.id),
        supabase.from("hero_slides").update({ position: a.position }).eq("id", b.id),
      ]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hero-slides"] }),
  });
}

// ── Admin: student directory ───────────────────────────────────────────
export function useAllStudents() {
  const { isAdmin } = useAuth();
  return useQuery({
    queryKey: ["admin-students"],
    queryFn: async (): Promise<ProfileRow[]> => {
      const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
    enabled: isAdmin,
  });
}

export function useAllUserRoles() {
  const { isAdmin } = useAuth();
  return useQuery({
    queryKey: ["admin-user-roles"],
    queryFn: async (): Promise<UserRoleRow[]> => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return (data ?? []) as UserRoleRow[];
    },
    enabled: isAdmin,
  });
}

export function usePromoteToAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("promote_user_to_admin", { p_user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-user-roles"] }),
  });
}

export function useDemoteFromAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("demote_admin_role", { p_user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-user-roles"] }),
  });
    }
