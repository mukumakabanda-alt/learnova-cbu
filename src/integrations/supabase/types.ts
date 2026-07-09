// Hand-written to match supabase/migrations/0001_init.sql.
// Once Lovable Cloud is enabled, prefer regenerating this from the real
// database (Lovable does this automatically when you edit tables in the
// Cloud UI) — treat this file as a starting point, not gospel.

export type MaterialType = "Notes" | "Past Paper" | "Slides" | "Summary" | "Assignment" | "Outline";
export type MaterialStatus = "catalog_only" | "processing" | "ready" | "failed";
export type MaterialSource = "admin" | "student";
export type AppRole = "student" | "admin";
export type RequestStatus = "open" | "fulfilled";

export interface Database {
  public: {
    Tables: {
      programmes: {
        Row: { code: string; name: string; school: string; years: number; accent: "gold" | "copper" | "teal"; created_at: string };
        Insert: Partial<Database["public"]["Tables"]["programmes"]["Row"]> & { code: string; name: string; school: string; years: number };
        Update: Partial<Database["public"]["Tables"]["programmes"]["Row"]>;
      };
      courses: {
        Row: {
          code: string; title: string; programme_code: string; year: number; semester: number;
          lecturer: string | null; description: string; topics: string[]; created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["courses"]["Row"]> & { code: string; title: string; programme_code: string; year: number; semester: number };
        Update: Partial<Database["public"]["Tables"]["courses"]["Row"]>;
      };
      profiles: {
        Row: {
          id: string; full_name: string; student_number: string | null; school: string | null;
          programme_code: string | null; year: number | null; role: AppRole;
          current_streak: number; longest_streak: number; last_study_date: string | null; created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & { id: string };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
      };
      materials: {
        Row: {
          id: string; course_code: string | null; title: string; type: MaterialType; year: number | null;
          pages: number | null; file_path: string | null; status: MaterialStatus; source: MaterialSource;
          summary: string | null; uploaded_by: string | null; created_at: string; updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["materials"]["Row"]> & { title: string };
        Update: Partial<Database["public"]["Tables"]["materials"]["Row"]>;
      };
      flashcards: {
        Row: { id: string; material_id: string; position: number; question: string; answer: string };
        Insert: Partial<Database["public"]["Tables"]["flashcards"]["Row"]> & { material_id: string; question: string; answer: string };
        Update: Partial<Database["public"]["Tables"]["flashcards"]["Row"]>;
      };
      quiz_questions: {
        Row: {
          id: string; material_id: string; position: number; question: string;
          options: string[]; correct_index: number; explanation: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["quiz_questions"]["Row"]> & { material_id: string; question: string; options: string[]; correct_index: number };
        Update: Partial<Database["public"]["Tables"]["quiz_questions"]["Row"]>;
      };
      material_requests: {
        Row: {
          id: string; requested_by: string | null; course_code: string | null; title: string;
          notes: string | null; status: RequestStatus; created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["material_requests"]["Row"]> & { title: string };
        Update: Partial<Database["public"]["Tables"]["material_requests"]["Row"]>;
      };
      saved_materials: {
        Row: { profile_id: string; material_id: string; created_at: string };
        Insert: { profile_id: string; material_id: string };
        Update: Partial<Database["public"]["Tables"]["saved_materials"]["Row"]>;
      };
    };
  };
}
