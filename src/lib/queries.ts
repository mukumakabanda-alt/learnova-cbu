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

export function useUniversalSearch(query: string) {
  return useQuery({
    queryKey: ["universal-search", query],
    queryFn: async (): Promise<UniversalSearchResults> => {
      const [coursesRes, materialsRes, programmesRes] = await Promise.all([
        supabase.from("courses").select("*, programmes(name, school)").order("code"),
        supabase
          .from("materials")
          .select("*, courses(title, code), uploader:profiles!materials_uploaded_by_profile_fkey(full_name)")
          .in("status", ["ready", "processing", "catalog_only"])
          .order("created_at", { ascending: false }),
        supabase.from("programmes").select("*").neq("code", "ADMIN").order("name"),
      ]);
      if (coursesRes.error) throw coursesRes.error;
      if (materialsRes.error) throw materialsRes.error;
      if (programmesRes.error) throw programmesRes.error;

      const allCourses = (coursesRes.data ?? []) as CourseWithProgramme[];
      const allMaterials = (materialsRes.data ?? []) as MaterialWithCourse[];
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
      // When programmeCode is set we inner-join courses and filter on it so
      // students only see material that actually belongs to their programme
      // (plus general uploads with no course attached). Without it we return
      // everything, same as before.
      const relation = programmeCode ? "courses!inner(title, code, programme_code)" : "courses(title, code)";
      let q = supabase
        .from("materials")
        .select(`*, ${relation}, uploader:profiles!materials_uploaded_by_profile_fkey(full_name)`)
        .in("status", ["ready", "processing", "catalog_only"])
        .order("created_at", { ascending: false });
      if (programmeCode) q = q.eq("courses.programme_code", programmeCode);
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
      const { data, error } = await supabase.from("materials").select("*, courses(title, code), uploader:profiles!materials_uploaded_by_profile_fkey(full_name)").eq("id", id).maybeSingle();
      if (error) throw error;
      return (data ?? null) as MaterialWithCourse | null;
    },
    enabled: !!id,
    refetchInterval: (query) => (query.state.data?.status === "processing" ? 3000 : false),
  });
}

// Powers two things on the study page from one query: "similar past
// papers for this course" (pass type: "Past Paper") and "popular in this
// course" (no type filter). Ordered by likes then download_count first so
// genuinely well-used material surfaces before merely-recent material.
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
        .order("likes_count", { ascending: false })
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
    // This is a background counter, not something the person directly
    // asked for — the file itself already downloaded fine by the time
    // this fires, so a failure here logs (for debugging) rather than
    // interrupting them with a toast.
    onError: (error: unknown) => console.error("increment_download_count failed:", error),
  });
}

// ── Likes ───────────────────────────────────────────────────────────────
// Whether the signed-in visitor has already liked this specific material —
// separate from `materials.likes_count` (the public total everyone sees),
// this is just enough to know which state the heart button should render.
export function useMaterialLikeStatus(materialId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["material-like", materialId, user?.id],
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from("material_likes")
        .select("material_id")
        .eq("material_id", materialId)
        .eq("profile_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
    enabled: !!materialId && !!user,
  });
}

// Toggles like/unlike through the toggle_material_like RPC (see the
// engagement migration) so the denormalised materials.likes_count — the
// number every "popular" sort actually reads — never drifts out of sync
// with the real rows in material_likes, even under concurrent taps.
export function useToggleMaterialLike() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (materialId: string): Promise<boolean> => {
      if (!user) throw new Error("Sign in to like materials.");
      const { data, error } = await supabase.rpc("toggle_material_like", { p_material_id: materialId });
      if (error) throw error;
      return !!data;
    },
    onSuccess: (_liked, materialId) => {
      qc.invalidateQueries({ queryKey: ["material-like", materialId] });
      qc.invalidateQueries({ queryKey: ["material", materialId] });
      qc.invalidateQueries({ queryKey: ["catalog"] });
      qc.invalidateQueries({ queryKey: ["popular-materials"] });
      qc.invalidateQueries({ queryKey: ["popular-courses"] });
      qc.invalidateQueries({ queryKey: ["related-materials"] });
    },
    // This used to fail completely silently — the heart button just
    // looked like it did nothing at all, with zero feedback about why
    // (not signed in, the migration adding this RPC not applied yet,
    // a network blip, anything). Now it always says what happened.
    onError: (error: unknown) => {
      const message = error instanceof Error && error.message ? error.message : "Couldn't like that right now — try again in a moment.";
      toast.error(message);
    },
  });
}

// ── Real "popular" — used by the homepage. Only ever reflects genuine
// engagement (likes + downloads); the caller is expected to hide its
// section entirely when this returns an empty array rather than padding
// it out with recent-but-unproven material, per the "don't show anything
// unless it's actually popular" rule the homepage follows.
export function usePopularMaterials(limit = 8) {
  return useQuery({
    queryKey: ["popular-materials", limit],
    queryFn: async (): Promise<MaterialWithCourse[]> => {
      const { data, error } = await supabase
        .from("materials")
        .select("*, courses(title, code)")
        .eq("status", "ready")
        .or("likes_count.gt.0,download_count.gt.0")
        .order("likes_count", { ascending: false })
        .order("download_count", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as MaterialWithCourse[];
    },
  });
}

// Aggregates the same real engagement signal up to the course level, for
// the homepage's "Popular courses right now" section. Courses with zero
// engagement across all their materials are excluded outright — a course
// simply doesn't show up here until real students have actually liked or
// downloaded something from it.
export function usePopularCourses(limit = 6) {
  return useQuery({
    queryKey: ["popular-courses", limit],
    queryFn: async (): Promise<CourseWithProgramme[]> => {
      const { data: engagement, error: engagementError } = await supabase
        .from("materials")
        .select("course_code, likes_count, download_count")
        .eq("status", "ready")
        .not("course_code", "is", null);
      if (engagementError) throw engagementError;

      const scoreByCourse = new Map<string, number>();
      for (const row of engagement ?? []) {
        if (!row.course_code) continue;
        const score = (row.likes_count ?? 0) * 3 + (row.download_count ?? 0); // a like is a stronger signal than a download
        scoreByCourse.set(row.course_code, (scoreByCourse.get(row.course_code) ?? 0) + score);
      }
      const ranked = [...scoreByCourse.entries()].filter(([, score]) => score > 0).sort((a, b) => b[1] - a[1]).slice(0, limit);
      if (ranked.length === 0) return [];

      const codes = ranked.map(([code]) => code);
      const { data: courses, error: coursesError } = await supabase
        .from("courses")
        .select("*, programmes(name, school)")
        .in("code", codes);
      if (coursesError) throw coursesError;

      const byCode = new Map((courses ?? []).map((c) => [c.code, c as CourseWithProgramme]));
      return ranked.map(([code]) => byCode.get(code)).filter((c): c is CourseWithProgramme => !!c);
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
    // Same fix as likes: a failed save used to just look like nothing
    // happened when the bookmark button was tapped.
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
    // Fires automatically on page load rather than from a tap, so this
    // logs for debugging instead of interrupting anyone with a toast —
    // but it no longer fails completely invisibly either.
    onError: (error: unknown) => console.error("bump_streak failed:", error),
  });
}

// ── Profile self-edit ───────────────────────────────────────────────────
// The "users update own profile" RLS policy has always allowed this —
// there was just no UI or hook wired up to it, so students had no way to
// fix a typo in their name, correct their programme/year, or add a phone
// number after signing up.
export function useUpdateProfile() {
  const { user, refreshProfile } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      fullName?: string;
      studentNumber?: string | null;
      school?: string;
      programmeCode?: string;
      year?: number;
      semester?: 1 | 2;
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
          ...(input.semester !== undefined ? { semester: input.semester } : {}),
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
