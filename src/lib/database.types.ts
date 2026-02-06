export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      activity_log: {
        Row: {
          action_type: string
          created_at: string | null
          details: Json | null
          entity_id: string
          entity_type: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string | null
          details?: Json | null
          entity_id: string
          entity_type: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string
          entity_type?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      items: {
        Row: {
          bg_color: string | null
          child_count: number | null
          content: Json | null
          created_at: string | null
          deleted_at: string | null
          due_at: string | null
          file_meta: Json | null
          folder_id: string | null
          fts: unknown
          height: number | null
          id: string
          is_archived: boolean | null
          is_completed: boolean | null
          is_pinned: boolean | null
          last_acknowledged_at: string | null
          next_trigger_at: string | null
          one_time_at: string | null
          position_x: number | null
          position_y: number | null
          priority: string | null
          recurring_config: Json | null
          remind_at: string | null
          remind_before: number | null
          reminder_recurring: string | null
          reminder_type: string | null
          scheduled_at: string | null
          tags: string[] | null
          title: string
          type: string
          updated_at: string | null
          user_id: string
          width: number | null
        }
        Insert: {
          bg_color?: string | null
          child_count?: number | null
          content?: Json | null
          created_at?: string | null
          deleted_at?: string | null
          due_at?: string | null
          file_meta?: Json | null
          folder_id?: string | null
          fts?: unknown
          height?: number | null
          id?: string
          is_archived?: boolean | null
          is_completed?: boolean | null
          is_pinned?: boolean | null
          last_acknowledged_at?: string | null
          next_trigger_at?: string | null
          one_time_at?: string | null
          position_x?: number | null
          position_y?: number | null
          priority?: string | null
          recurring_config?: Json | null
          remind_at?: string | null
          remind_before?: number | null
          reminder_recurring?: string | null
          reminder_type?: string | null
          scheduled_at?: string | null
          tags?: string[] | null
          title?: string
          type: string
          updated_at?: string | null
          user_id: string
          width?: number | null
        }
        Update: {
          bg_color?: string | null
          child_count?: number | null
          content?: Json | null
          created_at?: string | null
          deleted_at?: string | null
          due_at?: string | null
          file_meta?: Json | null
          folder_id?: string | null
          fts?: unknown
          height?: number | null
          id?: string
          is_archived?: boolean | null
          is_completed?: boolean | null
          is_pinned?: boolean | null
          last_acknowledged_at?: string | null
          next_trigger_at?: string | null
          one_time_at?: string | null
          position_x?: number | null
          position_y?: number | null
          priority?: string | null
          recurring_config?: Json | null
          remind_at?: string | null
          remind_before?: number | null
          reminder_recurring?: string | null
          reminder_type?: string | null
          scheduled_at?: string | null
          tags?: string[] | null
          title?: string
          type?: string
          updated_at?: string | null
          user_id?: string
          width?: number | null
        }
        Relationships: []
      }
      lists: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          item_count: number | null
          items: string[] | null
          name: string
          order: number | null
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          item_count?: number | null
          items?: string[] | null
          name: string
          order?: number | null
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          item_count?: number | null
          items?: string[] | null
          name?: string
          order?: number | null
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string | null
          data: Json | null
          id: string
          is_read: boolean | null
          message: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          auth: string
          created_at?: string | null
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          auth?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          color: string | null
          created_at: string | null
          deleted_at: string | null
          description: string | null
          due_at: string | null
          fts: unknown
          id: string
          is_completed: boolean | null
          item_completion: Json | null
          item_ids: string[] | null
          last_acknowledged_at: string | null
          list_id: string | null
          next_trigger_at: string | null
          one_time_at: string | null
          priority: string | null
          recurring_config: Json | null
          remind_at: string | null
          remind_before: number | null
          reminder_recurring: string | null
          reminder_type: string | null
          scheduled_at: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          due_at?: string | null
          fts?: unknown
          id?: string
          is_completed?: boolean | null
          item_completion?: Json | null
          item_ids?: string[] | null
          last_acknowledged_at?: string | null
          list_id?: string | null
          next_trigger_at?: string | null
          one_time_at?: string | null
          priority?: string | null
          recurring_config?: Json | null
          remind_at?: string | null
          remind_before?: number | null
          reminder_recurring?: string | null
          reminder_type?: string | null
          scheduled_at?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          due_at?: string | null
          fts?: unknown
          id?: string
          is_completed?: boolean | null
          item_completion?: Json | null
          item_ids?: string[] | null
          last_acknowledged_at?: string | null
          list_id?: string | null
          next_trigger_at?: string | null
          one_time_at?: string | null
          priority?: string | null
          recurring_config?: Json | null
          remind_at?: string | null
          remind_before?: number | null
          reminder_recurring?: string | null
          reminder_type?: string | null
          scheduled_at?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      run_maintenance_cleanup: { Args: never; Returns: undefined }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (Database["public"]["Tables"] & Database["public"]["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (Database["public"]["Tables"] &
      Database["public"]["Views"])
  ? (Database["public"]["Tables"] &
      Database["public"]["Views"])[PublicTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
  ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
  ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof Database["public"]["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof Database["public"]["Enums"]
  ? Database["public"]["Enums"][PublicEnumNameOrOptions]
  : never