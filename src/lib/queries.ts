import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

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
  courses: { title: string; code: string; programme_code?: string | null } | null;
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

// ── Admin: programmes ──────────────────────────────────────────────────
// Programmes previously could only ever be created via a one-off SQL seed
// — there was no way to add a new programme, fix its name/school, or set
// how many years it takes from inside the admin panel itself. Courses
// already reference programme_code as a foreign key, so creating a
// programme here is what unlocks assigning courses to it in the Courses
// tab (a new programme with no courses yet is expected and fine).
export function useCreateProgramme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { code: string; name: string; school: string; description?: string; durationYears: number }) => {
      const { error } = await supabase.from("programmes").insert({
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        school: input.school.trim(),
        description: input.description ?? "",
        duration_years: input.durationYears,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["programmes"] }),
  });
}

export function useUpdateProgramme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { code: string; name?: string; school?: string; description?: string; durationYears?: number }) => {
      const { code, durationYears, ...rest } = input;
      const { error } = await supabase
        .from("programmes")
        .update({ ...rest, ...(durationYears !== undefined ? { duration_years: durationYears } : {}) })
        .eq("code", code);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["programmes"] });
      qc.invalidateQueries({ queryKey: ["courses"] });
    },
  });
}

// Deleting a programme cascades to its courses (courses.programme_code has
// ON DELETE SET NULL in the newer schema, so courses survive as
// "no programme" rather than vanishing — same safety net the Courses tab
// already relies on for a deleted course's materials).
export function useDeleteProgramme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const { error } = await supabase.from("programmes").delete().eq("code", code);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["programmes"] });
      qc.invalidateQueries({ queryKey: ["courses"] });
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

// One consistent search over everything: programmes, courses (code,
// title, lecturer, description, outline topics) and materials (title,
// type, tags, and the code/title of whatever course they belong to).
// Previously Browse's search only looked at courses and Study's search
// only looked at material titles, so the exact same query could find
// completely different things depending on which box you typed it into.
// This single hook backs both entry points now. Client-side filtering
// for the same reason useSearchCourses is client-side (see its comment
// above) — small catalogue, and it sidesteps PostgREST's special
// characters in a raw query string.
export type UniversalSearchResults = {
  courses: CourseWithProgramme[];
  materials: MaterialWithCourse[];
  programmes: ProgrammeRow[];
};

export function useUniversalSearch(query: string, programmeCode?: string | null) {
  return useQuery({
    queryKey: ["universal-search", query, programmeCode ?? null],
    queryFn: async (): Promise<UniversalSearchResults> => {
      const [coursesRes, materialsRes, programmesRes] = await Promise.all([
        supabase.from("courses").select("*, programmes(name, school)").order("code"),
        supabase
          .from("materials")
          .select("*, courses(title, code, programme_code), uploader:profiles!materials_uploaded_by_profile_fkey(full_name)")
          .in("status", ["ready", "processing", "catalog_only"])
          .order("created_at", { ascending: false }),
        supabase.from("programmes").select("*").neq("code", "ADMIN").order("name"),
      ]);
      if (coursesRes.error) throw coursesRes.error;
      if (materialsRes.error) throw materialsRes.error;
      if (programmesRes.error) throw programmesRes.error;

      const allCourses = ((coursesRes.data ?? []) as CourseWithProgramme[]).filter((c) => !programmeCode || c.programme_code === programmeCode);
      const allMaterials = ((materialsRes.data ?? []) as MaterialWithCourse[]).filter((m) => !programmeCode || !m.course_code || m.courses?.programme_code === programmeCode);
      const allProgrammes = (programmesRes.data ?? []) as ProgrammeRow[];

      const needle = query.trim().toLowerCase();
      if (!needle) return { courses: allCourses, materials: allMaterials, programmes: allProgrammes };

      const courses = allCourses.filter((c) => {
        const haystacks = [
          c.code,
          c.title,
          c.lecturer ?? "",
          c.description ?? "",
          c.programme_code ?? "",
          c.programmes?.name ?? "",
          ...(c.topics ?? []),
        ];
        return haystacks.some((h) => h.toLowerCase().includes(needle));
      });

      const materials = allMaterials.filter((m) => {
        const haystacks = [m.title, m.type, m.courses?.code ?? "", m.courses?.title ?? "", ...(m.tags ?? [])];
        return haystacks.some((h) => h.toLowerCase().includes(needle));
      });

      const programmes = allProgrammes.filter((p) => {
        const haystacks = [p.code, p.name, p.school];
        return haystacks.some((h) => h.toLowerCase().includes(needle));
      });

      return { courses, materials, programmes };
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

export function useCatalog(search?: string, programmeCode?: string | null) {
  return useQuery({
    queryKey: ["catalog", search, programmeCode ?? null],
    queryFn: async (): Promise<MaterialWithCourse[]> => {
      const { data, error } = await supabase
        .from("materials")
        .select("*, courses(title, code, programme_code), uploader:profiles!materials_uploaded_by_profile_fkey(full_name)")
        .in("status", ["ready", "processing", "catalog_only"])
        .order("created_at", { ascending: false });
      if (error) throw error;

      const inProgramme = ((data ?? []) as MaterialWithCourse[]).filter(
        (m) => !programmeCode || !m.course_code || m.courses?.programme_code === programmeCode,
      );

      const needle = search?.trim().toLowerCase();
      if (!needle) return inProgramme;

      return inProgramme.filter((m) => {
        const haystacks = [m.title, m.type, m.courses?.code ?? "", m.courses?.title ?? "", ...(m.tags ?? [])];
        return haystacks.some((h) => h && h.toLowerCase().includes(needle));
      });
    },
  });
}

export function useMaterial(id: string) {
  return useQuery({
    queryKey: ["material", id],
    queryFn: async (): Promise<MaterialWithCourse | null> => {
      const { data, error } = await supabase
        .from("materials")
        .select("*, courses(title, code, programme_code), uploader:profiles!materials_uploaded_by_profile_fkey(full_name)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as MaterialWithCourse | null;
    },
    enabled: !!id,
  });
}

// Related materials for a course — used twice on the study page with
// different filters (e.g. "similar past papers" vs. "popular in this
// course"), so this takes a course code plus options rather than a
// single fixed shape.
export function useRelatedMaterials(
  courseCode: string | null | undefined,
  options?: { type?: string; excludeId?: string; limit?: number },
) {
  const limit = options?.limit ?? 6;
  return useQuery({
    queryKey: ["related-materials", courseCode ?? null, options?.type ?? null, options?.excludeId ?? null, limit],
    queryFn: async (): Promise<MaterialWithCourse[]> => {
      let q = supabase
        .from("materials")
        .select("*, courses(title, code, programme_code)")
        .in("status", ["ready", "processing", "catalog_only"])
        .order("created_at", { ascending: false })
        .limit(limit);
      q = courseCode ? q.eq("course_code", courseCode) : q.is("course_code", null);
      if (options?.type) q = q.eq("type", options.type);
      if (options?.excludeId) q = q.neq("id", options.excludeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as MaterialWithCourse[];
    },
    enabled: courseCode !== undefined,
  });
}

export function useIncrementDownload() {
  return useMutation({
    mutationFn: async (materialId: string) => {
      const { error } = await supabase.rpc("increment_download_count", { p_material_id: materialId });
      if (error) throw error;
    },
  });
}

// ── Likes ────────────────────────────────────────────────────────────
export function useMaterialLikeStatus(materialId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["material-like", materialId, user?.id],
    queryFn: async (): Promise<boolean> => {
      if (!user) return false;
      const { data, error } = await supabase
        .from("material_likes")
        .select("material_id")
        .eq("material_id", materialId)
        .eq("profile_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
    enabled: !!materialId && !!user,
  });
}

export function useToggleMaterialLike() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (materialId: string): Promise<boolean> => {
      if (!user) throw new Error("Sign in to like materials");
      const { data, error } = await supabase.rpc("toggle_material_like", { p_material_id: materialId });
      if (error) throw error;
      return !!data;
    },
    onSuccess: (_liked, materialId) => {
      qc.invalidateQueries({ queryKey: ["material-like", materialId] });
      qc.invalidateQueries({ queryKey: ["material", materialId] });
      qc.invalidateQueries({ queryKey: ["catalog"] });
      qc.invalidateQueries({ queryKey: ["popular-materials"] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error && error.message ? error.message : "Couldn't like that right now — try again in a moment.";
      toast.error(message);
    },
  });
}

// ── Popular / homepage ──────────────────────────────────────────────────
export function usePopularMaterials(limit = 8) {
  return useQuery({
    queryKey: ["popular-materials", limit],
    queryFn: async (): Promise<MaterialWithCourse[]> => {
      const { data, error } = await supabase
        .from("materials")
        .select("*, courses(title, code, programme_code)")
        .in("status", ["ready", "processing", "catalog_only"])
        .order("likes_count", { ascending: false })
        .order("download_count", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as MaterialWithCourse[];
    },
  });
}

export function usePopularCourses(limit = 6) {
  return useQuery({
    queryKey: ["popular-courses", limit],
    queryFn: async (): Promise<CourseWithProgramme[]> => {
      const { data, error } = await supabase
        .from("courses")
        .select("*, programmes(name, school)")
        .order("code")
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as CourseWithProgramme[];
    },
  });
}

// Per-course material count and the set of material types available for
// that course — powers Browse's file counts and its type filter chips
// ("show me courses that have a past paper") in one lightweight query
// instead of fetching every material's full row.
export function useCourseMaterialStats() {
  return useQuery({
    queryKey: ["course-material-stats"],
    queryFn: async (): Promise<Record<string, { count: number; types: string[] }>> => {
      const { data, error } = await supabase
        .from("materials")
        .select("course_code, type")
        .in("status", ["ready", "processing", "catalog_only"])
        .not("course_code", "is", null);
      if (error) throw error;
      const stats: Record<string, { count: number; types: string[] }> = {};
      for (const row of data ?? []) {
        if (!row.course_code) continue;
        if (!stats[row.course_code]) stats[row.course_code] = { count: 0, types: [] };
        stats[row.course_code].count += 1;
        if (!stats[row.course_code].types.includes(row.type)) stats[row.course_code].types.push(row.type);
      }
      return stats;
    },
  });
}

// Same shape as usePopularMaterials, ordered by recency instead of
// engagement — powers the homepage's "Recently added," which answers a
// different question ("is this library actually alive?") than
// "popular" does ("what's proven useful?").
export function useRecentMaterials(limit = 8) {
  return useQuery({
    queryKey: ["recent-materials", limit],
    queryFn: async (): Promise<MaterialWithCourse[]> => {
      const { data, error } = await supabase
        .from("materials")
        .select("*, courses(title, code, programme_code)")
        .in("status", ["ready", "processing", "catalog_only"])
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as MaterialWithCourse[];
    },
  });
}

// ── YouTube recommendations ─────────────────────────────────────────────
// Deliberately soft-fails to an empty list — missing YOUTUBE_API_KEY,
// quota errors, or an empty query all resolve to [] rather than
// rejecting, and the UI hides the whole section when it's empty. That's
// by design (it's a "nice to have," not core), but it means a missing
// secret is invisible rather than loud — worth checking directly in the
// Supabase Edge Function secrets if this section never appears.
export function useYoutubeRecommendations(query: string | null) {
  return useQuery({
    queryKey: ["youtube-recommendations", query],
    queryFn: async (): Promise<{ videoId: string; title: string; channelTitle: string; thumbnail: string }[]> => {
      if (!query?.trim()) return [];
      const { data, error } = await supabase.functions.invoke("youtube-recommendations", { body: { query } });
      if (error) {
        console.error("youtube-recommendations failed:", error);
        return [];
      }
      return data?.videos ?? [];
    },
    enabled: !!query?.trim(),
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

// Despite the name, this returns every request regardless of status —
// admin.tsx used to filter to "open" client-side. The Requests tab needs
// the full history (fulfilled/closed too), so the filtering now happens
// in the component instead, same data source.
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

// Update a request's status and/or leave yourself a note — "flag for
// later" just means adding a note while leaving it open, rather than a
// fourth status, so it still shows up in the open queue with context.
export function useUpdateMaterialRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status?: "open" | "fulfilled" | "closed"; notes?: string | null }) => {
      const { id, ...fields } = input;
      const { error } = await supabase.from("material_requests").update(fields).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["requests"] }),
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
        if (error && error.code !== "23505") throw error;
      } else {
        const { error } = await supabase.from("saved_materials").delete().eq("profile_id", user.id).eq("material_id", materialId);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-materials"] }),
    onError: (error: unknown) => {
      const message = error instanceof Error && error.message ? error.message : "Couldn't save that right now — try again in a moment.";
      toast.error(message);
    },
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
    onError: (error: unknown) => console.error("bump_streak failed:", error),
  });
}

// ── Profile self-edit ───────────────────────────────────────────────────
export function useUpdateProfile() {
  const { user, refreshProfile } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      fullName?: string;
      studentNumber?: string | null;
      school?: string;
      programmeCode?: string;
      year?: number;
      phone?: string | null;
    }) => {
      if (!user) throw new Error("Sign in first.");
      const { error } = await supabase
        .from("profiles")
        .update({
          ...(input.fullName !== undefined ? { full_name: input.fullName } : {}),
          ...(input.studentNumber !== undefined ? { student_number: input.studentNumber } : {}),
          ...(input.school !== undefined ? { school: input.school } : {}),
          ...(input.programmeCode !== undefined ? { programme_code: input.programmeCode } : {}),
          ...(input.year !== undefined ? { year: input.year } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
        })
        .eq("id", user.id);
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
      code: string; title: string; programmeCode: string; year: number; lecturer?: string; description?: string;
    }) => {
      const { error } = await supabase.from("courses").insert({
        code: input.code, title: input.title, programme_code: input.programmeCode,
        year: input.year, lecturer: input.lecturer, description: input.description ?? "",
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses"] }),
  });
}

export function useUpdateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      code: string;
      title?: string;
      programmeCode?: string;
      year?: number;
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
      tags?: string[];
      status?: "ready" | "catalog_only" | "failed";
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

export function useAdminAnalytics() {
  const { isAdmin } = useAuth();
  return useQuery({
    queryKey: ["admin-analytics"],
    queryFn: async () => {
      const [topDownloads, topLikes, failed, materialsRes, flashcardRows, quizRows] = await Promise.all([
        supabase.from("materials").select("id, title, download_count, courses(code)").order("download_count", { ascending: false }).limit(8),
        supabase.from("materials").select("id, title, likes_count, courses(code)").order("likes_count", { ascending: false }).limit(8),
        supabase.from("materials").select("id, title, processing_error, updated_at, courses(code)").eq("status", "failed").order("updated_at", { ascending: false }),
        supabase.from("materials").select("id, download_count, likes_count, status"),
        supabase.from("flashcards").select("material_id"),
        supabase.from("quiz_questions").select("material_id"),
      ]);
      if (topDownloads.error) throw topDownloads.error;
      if (topLikes.error) throw topLikes.error;
      if (failed.error) throw failed.error;
      if (materialsRes.error) throw materialsRes.error;
      if (flashcardRows.error) throw flashcardRows.error;
      if (quizRows.error) throw quizRows.error;

      const visible = (materialsRes.data ?? []).filter((m) => m.status === "ready" || m.status === "catalog_only");
      const noEngagement = visible.filter((m) => m.download_count === 0 && m.likes_count === 0);
      const withFlashcards = new Set((flashcardRows.data ?? []).map((f) => f.material_id));
      const withQuiz = new Set((quizRows.data ?? []).map((q) => q.material_id));

      return {
        topDownloads: (topDownloads.data ?? []) as (Pick<MaterialRow, "id" | "title" | "download_count"> & { courses: { code: string } | null })[],
        topLikes: (topLikes.data ?? []) as (Pick<MaterialRow, "id" | "title" | "likes_count"> & { courses: { code: string } | null })[],
        failed: (failed.data ?? []) as (Pick<MaterialRow, "id" | "title" | "processing_error" | "updated_at"> & { courses: { code: string } | null })[],
        noEngagementCount: noEngagement.length,
        visibleCount: visible.length,
        withFlashcardsCount: withFlashcards.size,
        withQuizCount: withQuiz.size,
      };
    },
    enabled: isAdmin,
  });
}

type SiteSettingsRow = Database["public"]["Tables"]["site_settings"]["Row"];

export function useSiteSettings() {
  return useQuery({
    queryKey: ["site-settings"],
    queryFn: async (): Promise<SiteSettingsRow> => {
      const { data, error } = await supabase.from("site_settings").select("*").eq("id", true).single();
      if (error) throw error;
      return data as SiteSettingsRow;
    },
  });
}

export function useUpdateSiteSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { homepage_title?: string; homepage_subtitle?: string; featured_course_codes?: string[] }) => {
      const { error } = await supabase.from("site_settings").update(input).eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["site-settings"] }),
  });
                               }
