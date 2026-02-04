// Supabase Database型定義
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          name: string | null
          role: 'admin' | 'staff'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          email: string
          name?: string | null
          role?: 'admin' | 'staff'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          name?: string | null
          role?: 'admin' | 'staff'
          created_at?: string
          updated_at?: string
        }
      }
      helpers: {
        Row: {
          id: string
          name: string
          email: string | null
          hourly_wage: number | null
          gender: string
          display_name: string | null
          personal_token: string | null
          order_index: number
          role: string | null
          insurances: Json
          standard_remuneration: number
          deleted: boolean
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          email?: string | null
          hourly_wage?: number | null
          gender?: string
          display_name?: string | null
          personal_token?: string | null
          order_index?: number
          role?: string | null
          insurances?: Json
          standard_remuneration?: number
          deleted?: boolean
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          email?: string | null
          hourly_wage?: number | null
          gender?: string
          display_name?: string | null
          personal_token?: string | null
          order_index?: number
          role?: string | null
          insurances?: Json
          standard_remuneration?: number
          deleted?: boolean
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      shifts: {
        Row: {
          id: string
          date: string
          start_time: string
          end_time: string
          helper_id: string | null
          client_name: string
          service_type: string | null
          hours: number | null
          hourly_wage: number | null
          location: string | null
          cancel_status: string | null
          canceled_at: string | null
          deleted: boolean
          deleted_at: string | null
          deleted_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          date: string
          start_time: string
          end_time: string
          helper_id?: string | null
          client_name: string
          service_type?: string | null
          hours?: number | null
          hourly_wage?: number | null
          location?: string | null
          cancel_status?: string | null
          canceled_at?: string | null
          deleted?: boolean
          deleted_at?: string | null
          deleted_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          date?: string
          start_time?: string
          end_time?: string
          helper_id?: string | null
          client_name?: string
          service_type?: string | null
          hours?: number | null
          hourly_wage?: number | null
          location?: string | null
          cancel_status?: string | null
          canceled_at?: string | null
          deleted?: boolean
          deleted_at?: string | null
          deleted_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      day_off_requests: {
        Row: {
          id: string
          year_month: string
          requests: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          year_month: string
          requests?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          year_month?: string
          requests?: Json
          created_at?: string
          updated_at?: string
        }
      }
      scheduled_day_offs: {
        Row: {
          id: string
          year_month: string
          scheduled_day_offs: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          year_month: string
          scheduled_day_offs?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          year_month?: string
          scheduled_day_offs?: Json
          created_at?: string
          updated_at?: string
        }
      }
      display_texts: {
        Row: {
          id: string
          year_month: string
          display_texts: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          year_month: string
          display_texts?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          year_month?: string
          display_texts?: Json
          created_at?: string
          updated_at?: string
        }
      }
      backups: {
        Row: {
          id: string
          type: string
          data: Json
          description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          type: string
          data: Json
          description?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          type?: string
          data?: Json
          description?: string | null
          created_at?: string
        }
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