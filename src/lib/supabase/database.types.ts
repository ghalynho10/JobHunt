export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          id: number
          kill_switch_enabled: boolean
          updated_at: string
        }
        Insert: {
          id?: number
          kill_switch_enabled?: boolean
          updated_at?: string
        }
        Update: {
          id?: number
          kill_switch_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      application: {
        Row: {
          applied_at: string
          company_name: string
          created_at: string
          id: string
          job_description: string | null
          job_location: string | null
          job_title: string
          job_url: string
          posted_at: string | null
          profile_id: string
          salary_currency: string | null
          salary_max: number | null
          salary_min: number | null
          source: string
          source_job_id: string
          updated_at: string
        }
        Insert: {
          applied_at?: string
          company_name: string
          created_at?: string
          id?: string
          job_description?: string | null
          job_location?: string | null
          job_title: string
          job_url: string
          posted_at?: string | null
          profile_id: string
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          source: string
          source_job_id: string
          updated_at?: string
        }
        Update: {
          applied_at?: string
          company_name?: string
          created_at?: string
          id?: string
          job_description?: string | null
          job_location?: string | null
          job_title?: string
          job_url?: string
          posted_at?: string | null
          profile_id?: string
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          source?: string
          source_job_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      application_answer: {
        Row: {
          answer: string
          application_id: string
          created_at: string
          id: string
          profile_id: string
          question_key: string
          updated_at: string
        }
        Insert: {
          answer: string
          application_id: string
          created_at?: string
          id?: string
          profile_id: string
          question_key: string
          updated_at?: string
        }
        Update: {
          answer?: string
          application_id?: string
          created_at?: string
          id?: string
          profile_id?: string
          question_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_answer_application_fkey"
            columns: ["application_id", "profile_id"]
            isOneToOne: false
            referencedRelation: "application"
            referencedColumns: ["id", "profile_id"]
          },
        ]
      }
      job_preference: {
        Row: {
          created_at: string
          desired_locations: string[]
          desired_titles: string[]
          minimum_pay: number | null
          minimum_pay_currency: string | null
          profile_id: string
          remote_preference: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          desired_locations?: string[]
          desired_titles?: string[]
          minimum_pay?: number | null
          minimum_pay_currency?: string | null
          profile_id: string
          remote_preference?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          desired_locations?: string[]
          desired_titles?: string[]
          minimum_pay?: number | null
          minimum_pay_currency?: string | null
          profile_id?: string
          remote_preference?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_preference_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      profile: {
        Row: {
          created_at: string
          full_name: string
          id: string
          location: string | null
          summary: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id: string
          location?: string | null
          summary?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          location?: string | null
          summary?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profile_skill: {
        Row: {
          created_at: string
          id: string
          name: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          profile_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_skill_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      scaffold_check: {
        Row: {
          created_at: string
          id: string
          note: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string
          user_id?: string
        }
        Relationships: []
      }
      work_experience: {
        Row: {
          company: string
          created_at: string
          description: string | null
          ended_on: string | null
          id: string
          location: string | null
          profile_id: string
          started_on: string
          title: string
          updated_at: string
        }
        Insert: {
          company: string
          created_at?: string
          description?: string | null
          ended_on?: string | null
          id?: string
          location?: string | null
          profile_id: string
          started_on: string
          title: string
          updated_at?: string
        }
        Update: {
          company?: string
          created_at?: string
          description?: string | null
          ended_on?: string | null
          id?: string
          location?: string | null
          profile_id?: string
          started_on?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_experience_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

