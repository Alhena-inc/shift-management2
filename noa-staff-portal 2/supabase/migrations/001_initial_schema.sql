-- ============================================================
-- のあスタッフポータル - Supabase Database Schema
-- Migration: 001_initial_schema
-- ============================================================

-- ─── 1. ENUM Types ───
CREATE TYPE user_role AS ENUM ('helper', 'coordinator', 'admin');
CREATE TYPE procedure_status AS ENUM ('draft', 'pending', 'approved', 'rejected');
CREATE TYPE assessment_status AS ENUM ('draft', 'active', 'archived');
CREATE TYPE service_type AS ENUM ('居宅介護', '重度訪問介護', '行動援護', '移動支援');
CREATE TYPE gender_type AS ENUM ('男', '女', 'その他');
CREATE TYPE housing_type AS ENUM ('持ち家', '借家', 'グループホーム', 'ケアホーム', '入所施設', '医療機関', 'その他');

-- ─── 2. Staff Profiles (linked to Supabase Auth) ───
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  line_user_id TEXT UNIQUE,
  display_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'helper',
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 3. Clients (利用者) ───
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 基本情報
  name TEXT NOT NULL,
  furigana TEXT,
  birth_date DATE,
  age INTEGER,
  gender gender_type,
  address TEXT,
  phone TEXT,
  fax TEXT,
  housing_type housing_type,
  -- 障がい・医療
  disability_type TEXT,           -- 身体障がい, 精神障がい, 療育手帳, 難病
  disability_grade TEXT,          -- 級・等級
  disease_name TEXT,              -- 疾患名
  support_category TEXT,          -- 障害支援区分 (区分1〜6)
  service_type service_type,
  -- 家族・社会関係
  family_structure TEXT,          -- 家族構成
  primary_caregiver TEXT,         -- 主たる介護者
  social_relations TEXT,          -- 社会関係図
  -- 本人・家族の意向
  client_wishes TEXT,             -- 本人の主訴
  family_wishes TEXT,             -- 家族の主訴
  desired_living TEXT,            -- 希望する暮らし（本人）
  family_desired_living TEXT,     -- 希望する暮らし（家族）
  -- メタ
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 4. Emergency Contacts (緊急連絡先) ───
CREATE TABLE emergency_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  relationship TEXT,              -- 続柄
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 5. Client-Staff Assignments (担当割り当て) ───
CREATE TABLE client_staff_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, staff_id)
);

-- ─── 6. Assessments (アセスメント) ───
-- JSONB data column stores the full structured assessment
-- matching the 10-category accordion UI structure
CREATE TABLE assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  assessor_name TEXT NOT NULL,
  assessed_date DATE NOT NULL,
  overview TEXT,                  -- 概要（支援経過・現状と課題）
  -- JSONB: array of categories, each with sections and items
  -- Structure: [{ id, title, icon, color, sections: [{ title, items: [{ label, value, type }] }] }]
  data JSONB NOT NULL DEFAULT '[]'::jsonb,
  status assessment_status NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 7. Procedures (手順書) ───
CREATE TABLE procedures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status procedure_status NOT NULL DEFAULT 'draft',
  created_by UUID NOT NULL REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 8. Procedure Items (手順書ステップ) ───
CREATE TABLE procedure_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_id UUID NOT NULL REFERENCES procedures(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  heading TEXT NOT NULL,          -- 項目見出し
  content TEXT NOT NULL,          -- サービス内容と手順
  note TEXT,                      -- 留意事項
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 9. Approval Requests (承認リクエスト / LINE通知用) ───
CREATE TABLE approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_id UUID NOT NULL REFERENCES procedures(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES profiles(id),
  assigned_to UUID NOT NULL REFERENCES profiles(id),  -- サ責
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  message TEXT,
  responded_at TIMESTAMPTZ,
  line_notified BOOLEAN NOT NULL DEFAULT false,
  line_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 10. Weekly Schedule (週間予定) ───
CREATE TABLE weekly_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=月, 6=日
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  service_name TEXT NOT NULL,     -- サービス名
  provider TEXT,                  -- 提供機関
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ───
CREATE INDEX idx_clients_name ON clients(name);
CREATE INDEX idx_clients_service_type ON clients(service_type);
CREATE INDEX idx_clients_active ON clients(is_active) WHERE is_active = true;
CREATE INDEX idx_assignments_staff ON client_staff_assignments(staff_id);
CREATE INDEX idx_assignments_client ON client_staff_assignments(client_id);
CREATE INDEX idx_assessments_client ON assessments(client_id);
CREATE INDEX idx_assessments_status ON assessments(status);
CREATE INDEX idx_procedures_client ON procedures(client_id);
CREATE INDEX idx_procedures_status ON procedures(status);
CREATE INDEX idx_procedure_items_proc ON procedure_items(procedure_id);
CREATE INDEX idx_approval_assigned ON approval_requests(assigned_to, status);
CREATE INDEX idx_emergency_client ON emergency_contacts(client_id);
CREATE INDEX idx_weekly_client ON weekly_schedules(client_id);

-- ─── Updated_at Trigger ───
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_profiles_updated BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_clients_updated BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_assessments_updated BEFORE UPDATE ON assessments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_procedures_updated BEFORE UPDATE ON procedures FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_procedure_items_updated BEFORE UPDATE ON procedure_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Row Level Security (RLS) ───
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_staff_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE procedures ENABLE ROW LEVEL SECURITY;
ALTER TABLE procedure_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_schedules ENABLE ROW LEVEL SECURITY;

-- ─── RLS Policies ───

-- Helper function: get user role
CREATE OR REPLACE FUNCTION get_user_role(user_id UUID)
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = user_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: check if user is assigned to client
CREATE OR REPLACE FUNCTION is_assigned_to_client(user_id UUID, p_client_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM client_staff_assignments
    WHERE staff_id = user_id AND client_id = p_client_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- profiles: everyone can read, only admin can modify
CREATE POLICY profiles_select ON profiles FOR SELECT USING (true);
CREATE POLICY profiles_insert ON profiles FOR INSERT WITH CHECK (
  get_user_role(auth.uid()) = 'admin' OR id = auth.uid()
);
CREATE POLICY profiles_update ON profiles FOR UPDATE USING (
  get_user_role(auth.uid()) = 'admin' OR id = auth.uid()
);

-- clients: helpers see assigned only, coordinator/admin see all
CREATE POLICY clients_select ON clients FOR SELECT USING (
  get_user_role(auth.uid()) IN ('coordinator', 'admin')
  OR is_assigned_to_client(auth.uid(), id)
);
CREATE POLICY clients_insert ON clients FOR INSERT WITH CHECK (
  get_user_role(auth.uid()) IN ('coordinator', 'admin')
);
CREATE POLICY clients_update ON clients FOR UPDATE USING (
  get_user_role(auth.uid()) IN ('coordinator', 'admin')
);

-- emergency_contacts: same as clients
CREATE POLICY ec_select ON emergency_contacts FOR SELECT USING (
  get_user_role(auth.uid()) IN ('coordinator', 'admin')
  OR is_assigned_to_client(auth.uid(), client_id)
);
CREATE POLICY ec_modify ON emergency_contacts FOR ALL USING (
  get_user_role(auth.uid()) IN ('coordinator', 'admin')
);

-- assignments: coordinator/admin manage, helpers read own
CREATE POLICY assign_select ON client_staff_assignments FOR SELECT USING (
  get_user_role(auth.uid()) IN ('coordinator', 'admin')
  OR staff_id = auth.uid()
);
CREATE POLICY assign_modify ON client_staff_assignments FOR ALL USING (
  get_user_role(auth.uid()) IN ('coordinator', 'admin')
);

-- assessments: same visibility as clients
CREATE POLICY assess_select ON assessments FOR SELECT USING (
  get_user_role(auth.uid()) IN ('coordinator', 'admin')
  OR is_assigned_to_client(auth.uid(), client_id)
);
CREATE POLICY assess_modify ON assessments FOR ALL USING (
  get_user_role(auth.uid()) IN ('coordinator', 'admin')
);

-- procedures: everyone sees approved, own drafts visible, coordinator/admin see all
CREATE POLICY proc_select ON procedures FOR SELECT USING (
  get_user_role(auth.uid()) IN ('coordinator', 'admin')
  OR (status = 'approved' AND is_assigned_to_client(auth.uid(), client_id))
  OR (created_by = auth.uid())
);
CREATE POLICY proc_insert ON procedures FOR INSERT WITH CHECK (true);
CREATE POLICY proc_update ON procedures FOR UPDATE USING (
  get_user_role(auth.uid()) IN ('coordinator', 'admin')
  OR (created_by = auth.uid() AND status IN ('draft', 'rejected'))
);

-- procedure_items: follows procedure visibility
CREATE POLICY pitems_select ON procedure_items FOR SELECT USING (
  EXISTS(
    SELECT 1 FROM procedures p WHERE p.id = procedure_id
    AND (
      get_user_role(auth.uid()) IN ('coordinator', 'admin')
      OR (p.status = 'approved' AND is_assigned_to_client(auth.uid(), p.client_id))
      OR p.created_by = auth.uid()
    )
  )
);
CREATE POLICY pitems_modify ON procedure_items FOR ALL USING (
  EXISTS(
    SELECT 1 FROM procedures p WHERE p.id = procedure_id
    AND (
      get_user_role(auth.uid()) IN ('coordinator', 'admin')
      OR (p.created_by = auth.uid() AND p.status IN ('draft', 'rejected'))
    )
  )
);

-- approval_requests
CREATE POLICY approval_select ON approval_requests FOR SELECT USING (
  get_user_role(auth.uid()) IN ('coordinator', 'admin')
  OR requested_by = auth.uid()
  OR assigned_to = auth.uid()
);
CREATE POLICY approval_insert ON approval_requests FOR INSERT WITH CHECK (true);
CREATE POLICY approval_update ON approval_requests FOR UPDATE USING (
  get_user_role(auth.uid()) IN ('coordinator', 'admin')
  OR assigned_to = auth.uid()
);

-- weekly_schedules: same as clients
CREATE POLICY ws_select ON weekly_schedules FOR SELECT USING (
  get_user_role(auth.uid()) IN ('coordinator', 'admin')
  OR is_assigned_to_client(auth.uid(), client_id)
);
CREATE POLICY ws_modify ON weekly_schedules FOR ALL USING (
  get_user_role(auth.uid()) IN ('coordinator', 'admin')
);
