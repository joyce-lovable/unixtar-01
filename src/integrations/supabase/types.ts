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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      mbom_groups: {
        Row: {
          created_at: string
          customer_part_name: string
          downloaded: boolean
          group_id: number
          id: string
        }
        Insert: {
          created_at?: string
          customer_part_name: string
          downloaded?: boolean
          group_id?: number
          id?: string
        }
        Update: {
          created_at?: string
          customer_part_name?: string
          downloaded?: boolean
          group_id?: number
          id?: string
        }
        Relationships: []
      }
      mbom_results: {
        Row: {
          cad_sequence: number
          component_part_number: string
          created_at: string
          customer_part_name: string
          file_name: string
          group_id: number | null
          has_substitute: string
          id: string
          main_part_number: string
          material_category: string
          material_quality: string
          production_process: string
          quantity: number
          remark: string | null
          sort_order: number
          source: string
          unit: string
        }
        Insert: {
          cad_sequence: number
          component_part_number: string
          created_at?: string
          customer_part_name: string
          file_name: string
          group_id?: number | null
          has_substitute?: string
          id?: string
          main_part_number: string
          material_category: string
          material_quality?: string
          production_process?: string
          quantity: number
          remark?: string | null
          sort_order?: number
          source?: string
          unit: string
        }
        Update: {
          cad_sequence?: number
          component_part_number?: string
          created_at?: string
          customer_part_name?: string
          file_name?: string
          group_id?: number | null
          has_substitute?: string
          id?: string
          main_part_number?: string
          material_category?: string
          material_quality?: string
          production_process?: string
          quantity?: number
          remark?: string | null
          sort_order?: number
          source?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "mbom_results_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "mbom_groups"
            referencedColumns: ["group_id"]
          },
        ]
      }
      mold_groups: {
        Row: {
          created_at: string
          downloaded: boolean
          group_id: number
          id: string
          part_name: string
        }
        Insert: {
          created_at?: string
          downloaded?: boolean
          group_id?: number
          id?: string
          part_name: string
        }
        Update: {
          created_at?: string
          downloaded?: boolean
          group_id?: number
          id?: string
          part_name?: string
        }
        Relationships: []
      }
      mold_ocr_results: {
        Row: {
          created_at: string
          file_name: string
          group_id: number | null
          id: string
          mold_number: string
          part_name: string
          seq_number: number
        }
        Insert: {
          created_at?: string
          file_name: string
          group_id?: number | null
          id?: string
          mold_number: string
          part_name: string
          seq_number: number
        }
        Update: {
          created_at?: string
          file_name?: string
          group_id?: number | null
          id?: string
          mold_number?: string
          part_name?: string
          seq_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "mold_ocr_results_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "mold_groups"
            referencedColumns: ["group_id"]
          },
        ]
      }
      sop_groups: {
        Row: {
          created_at: string
          downloaded: boolean
          group_id: number
          id: string
          part_number: string
        }
        Insert: {
          created_at?: string
          downloaded?: boolean
          group_id?: number
          id?: string
          part_number: string
        }
        Update: {
          created_at?: string
          downloaded?: boolean
          group_id?: number
          id?: string
          part_number?: string
        }
        Relationships: []
      }
      sop_ocr_results: {
        Row: {
          created_at: string
          file_name: string | null
          group_id: number | null
          id: string
          operation: string
          part_number: string
          process_code: number
          process_name: string
          sequence: string
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          group_id?: number | null
          id?: string
          operation: string
          part_number: string
          process_code: number
          process_name: string
          sequence: string
        }
        Update: {
          created_at?: string
          file_name?: string | null
          group_id?: number | null
          id?: string
          operation?: string
          part_number?: string
          process_code?: number
          process_name?: string
          sequence?: string
        }
        Relationships: [
          {
            foreignKeyName: "sop_ocr_results_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "sop_groups"
            referencedColumns: ["group_id"]
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
  public: {
    Enums: {},
  },
} as const
