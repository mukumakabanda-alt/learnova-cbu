export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      courses: {
        Row: {
          code: string
          created_at: string
          description: string
          lecturer: string | null
          programme_code: string | null
          semester: number
          title: string
          topics: string[]
          updated_at: string
          year: number
        }
        Insert: {
          code: string
          created_at?: string
          description?: string
          lecturer?: string | null
          programme_code?: string | null
          semester?: number
          title: string
          topics?: string[]
          updated_at?: string
          year?: number
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          lecturer?: string | null
          programme_code?: string | null
          semester?: number
          title?: string
          topics?: string[]
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "courses_programme_code_fkey"
            columns: ["programme_code"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["code"]
          },
        ]
      }
      flashcards: {
        Row: {
          answer: string
          created_at: string
          id: string
          material_id: string
          position: number
          question: string
        }
        Insert: {
          answer: string
          created_at?: string
          id?: string
          material_id: string
          position?: number
          question: string
        }
        Update: {
          answer?: string
          created_at?: string
          id?: string
          material_id?: string
          position?: number
          question?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcards_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
        ]
      }
      hero_slides: {
        Row: {
          created_at: string
          id: string
          image_path: string
          position: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_path: string
          position?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_path?: string
          position?: number
          updated_at?: string
        }
        Relationships: []
      }
      material_requests: {
        Row: {
          course_code: string | null
          created_at: string
          id: string
          notes: string | null
          requested_by: string
          status: Database["public"]["Enums"]["request_status"]
          title: string
          updated_at: string
        }
        Insert: {
          course_code?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          requested_by: string
          status?: Database["public"]["Enums"]["request_status"]
          title: string
          updated_at?: string
        }
        Update: {
          course_code?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          requested_by?: string
          status?: Database["public"]["Enums"]["request_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_requests_course_code_fkey"
            columns: ["course_code"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["code"]
          },
        ]
      }
      materials: {
        Row: {
          content_year: number | null
          course_code: string | null
          created_at: string
          download_count: number
          file_path: string | null
          id: string
          pages: number | null
          source: string
          status: Database["public"]["Enums"]["material_status"]
          summary: string | null
          tags: string[]
          title: string
          type: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          content_year?: number | null
          course_code?: string | null
          created_at?: string
          download_count?: number
          file_path?: string | null
          id?: string
          pages?: number | null
          source?: string
          status?: Database["public"]["Enums"]["material_status"]
          summary?: string | null
          tags?: string[]
          title: string
          type?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          content_year?: number | null
          course_code?: string | null
          created_at?: string
          download_count?: number
          file_path?: string | null
          id?: string
          pages?: number | null
          source?: string
          status?: Database["public"]["Enums"]["material_status"]
          summary?: string | null
          tags?: string[]
          title?: string
          type?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "materials_course_code_fkey"
            columns: ["course_code"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["code"]
          },
        ]
      }
      pipeline_invocations: {
        Row: {
          created_at: string
          id: string
          material_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          material_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          material_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_invocations_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          current_streak: number
          full_name: string
          id: string
          last_studied_on: string | null
          longest_streak: number
          phone: string | null
          programme_code: string
          school: string
          semester: number
          student_number: string | null
          updated_at: string
          weekly_progress: number
          year: number
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          current_streak?: number
          full_name?: string
          id: string
          last_studied_on?: string | null
          longest_streak?: number
          phone?: string | null
          programme_code?: string
          school?: string
          semester?: number
          student_number?: string | null
          updated_at?: string
          weekly_progress?: number
          year?: number
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          current_streak?: number
          full_name?: string
          id?: string
          last_studied_on?: string | null
          longest_streak?: number
          phone?: string | null
          programme_code?: string
          school?: string
          semester?: number
          student_number?: string | null
          updated_at?: string
          weekly_progress?: number
          year?: number
        }
        Relationships: []
      }
      programmes: {
        Row: {
          code: string
          created_at: string
          description: string
          duration_years: number
          name: string
          school: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string
          duration_years?: number
          name: string
          school: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          duration_years?: number
          name?: string
          school?: string
          updated_at?: string
        }
        Relationships: []
      }
      quiz_questions: {
        Row: {
          correct_index: number
          created_at: string
          explanation: string
          id: string
          material_id: string
          options: string[]
          position: number
          question: string
        }
        Insert: {
          correct_index?: number
          created_at?: string
          explanation?: string
          id?: string
          material_id: string
          options?: string[]
          position?: number
          question: string
        }
        Update: {
          correct_index?: number
          created_at?: string
          explanation?: string
          id?: string
          material_id?: string
          options?: string[]
          position?: number
          question?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_materials: {
        Row: {
          created_at: string
          material_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          material_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          material_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_materials_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bump_streak: { Args: { p_profile_id: string }; Returns: undefined }
      claim_initial_admin: { Args: never; Returns: boolean }
      demote_admin_role: { Args: { p_user_id: string }; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_download_count: {
        Args: { p_material_id: string }
        Returns: undefined
      }
      is_admin: { Args: { _user_id?: string }; Returns: boolean }
      promote_user_to_admin: { Args: { p_user_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "lecturer" | "student"
      material_status: "processing" | "ready" | "failed" | "catalog_only"
      request_status: "open" | "fulfilled" | "closed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "lecturer", "student"],
      material_status: ["processing", "ready", "failed", "catalog_only"],
      request_status: ["open", "fulfilled", "closed"],
    },
  },
} as const
