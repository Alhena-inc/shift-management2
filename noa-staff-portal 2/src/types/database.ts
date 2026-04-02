// ─── Enums ───
export type UserRole = 'helper' | 'coordinator' | 'admin'
export type ProcedureStatus = 'draft' | 'pending' | 'approved' | 'rejected'
export type AssessmentStatus = 'draft' | 'active' | 'archived'
export type ServiceType = '居宅介護' | '重度訪問介護' | '行動援護' | '移動支援'
export type GenderType = '男' | '女' | 'その他'
export type HousingType = '持ち家' | '借家' | 'グループホーム' | 'ケアホーム' | '入所施設' | '医療機関' | 'その他'

// ─── Tables ───
export interface Profile {
  id: string
  line_user_id: string | null
  display_name: string
  role: UserRole
  avatar_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Client {
  id: string
  name: string
  furigana: string | null
  birth_date: string | null
  age: number | null
  gender: GenderType | null
  address: string | null
  phone: string | null
  fax: string | null
  housing_type: HousingType | null
  disability_type: string | null
  disability_grade: string | null
  disease_name: string | null
  support_category: string | null
  service_type: ServiceType | null
  family_structure: string | null
  primary_caregiver: string | null
  social_relations: string | null
  client_wishes: string | null
  family_wishes: string | null
  desired_living: string | null
  family_desired_living: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface EmergencyContact {
  id: string
  client_id: string
  name: string
  relationship: string | null
  phone: string
  email: string | null
  address: string | null
  sort_order: number
  created_at: string
}

export interface ClientStaffAssignment {
  id: string
  client_id: string
  staff_id: string
  is_primary: boolean
  created_at: string
}

// ─── Assessment JSONB Structure ───
export interface AssessmentItem {
  label: string
  value: string
  type?: 'text' | 'phone' | 'disease' | 'warning' | 'has_support' | 'status_none'
}

export interface AssessmentSection {
  title: string
  items: AssessmentItem[]
}

export interface AssessmentCategory {
  id: string
  title: string
  icon: string
  color: string
  sections: AssessmentSection[]
}

export interface Assessment {
  id: string
  client_id: string
  assessor_name: string
  assessed_date: string
  overview: string | null
  data: AssessmentCategory[]
  status: AssessmentStatus
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Procedure {
  id: string
  client_id: string
  title: string
  status: ProcedureStatus
  created_by: string
  approved_by: string | null
  approved_at: string | null
  rejection_reason: string | null
  version: number
  created_at: string
  updated_at: string
}

export interface ProcedureItem {
  id: string
  procedure_id: string
  sort_order: number
  heading: string
  content: string
  note: string | null
  created_at: string
  updated_at: string
}

export interface ApprovalRequest {
  id: string
  procedure_id: string
  requested_by: string
  assigned_to: string
  status: 'pending' | 'approved' | 'rejected'
  message: string | null
  responded_at: string | null
  line_notified: boolean
  line_notified_at: string | null
  created_at: string
}

export interface WeeklySchedule {
  id: string
  client_id: string
  day_of_week: number
  start_time: string
  end_time: string
  service_name: string
  provider: string | null
  notes: string | null
  created_at: string
}

// ─── Joined Types ───
export interface ClientWithAssignments extends Client {
  assignments?: ClientStaffAssignment[]
  emergency_contacts?: EmergencyContact[]
}

export interface ProcedureWithItems extends Procedure {
  items: ProcedureItem[]
  creator?: Profile
  approver?: Profile
}
