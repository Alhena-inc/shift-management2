-- deleted_helpersテーブルの作成（削除されたヘルパーのバックアップ用）
CREATE TABLE IF NOT EXISTS public.deleted_helpers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id text NOT NULL,
  name text NOT NULL,
  email text,
  hourly_wage numeric,
  order_index integer,
  gender text,
  personal_token text,
  role text,
  insurances text[],
  standard_remuneration numeric,
  deleted_at timestamptz DEFAULT now(),
  deleted_by text,
  deletion_reason text,
  original_created_at timestamptz,
  original_updated_at timestamptz,

  -- その他のヘルパー情報
  last_name text,
  first_name text,
  name_kana text,
  birth_date date,
  postal_code text,
  address text,
  phone text,
  emergency_contact text,
  emergency_contact_phone text,
  spreadsheet_gid text,
  salary_type text,
  employment_type text,
  hire_date date,
  department text,
  status text,
  cash_payment boolean,
  treatment_improvement_per_hour numeric,
  office_hourly_rate numeric,
  base_salary numeric,
  treatment_allowance numeric,
  other_allowances jsonb,
  dependents integer,
  resident_tax_type text,
  residential_tax numeric,
  age integer,
  has_withholding_tax boolean,
  tax_column_type text,
  contract_period text,
  qualifications text[],
  qualification_dates jsonb,
  service_types text[],
  commute_methods text[],
  attendance_template jsonb
);

-- deleted_helpersテーブルからhelpersテーブルにデータを復元するための関数
CREATE OR REPLACE FUNCTION restore_helper(deleted_helper_id uuid)
RETURNS void AS $$
DECLARE
  helper_record record;
BEGIN
  -- deleted_helpersから該当レコードを取得
  SELECT * INTO helper_record FROM deleted_helpers WHERE id = deleted_helper_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deleted helper not found';
  END IF;

  -- helpersテーブルに復元
  INSERT INTO helpers (
    id, name, email, hourly_wage, order_index, gender,
    personal_token, role, deleted
  ) VALUES (
    helper_record.original_id,
    helper_record.name,
    helper_record.email,
    helper_record.hourly_wage,
    helper_record.order_index,
    helper_record.gender,
    helper_record.personal_token,
    helper_record.role,
    false -- 削除フラグをfalseに設定
  );

  -- deleted_helpersから削除
  DELETE FROM deleted_helpers WHERE id = deleted_helper_id;
END;
$$ LANGUAGE plpgsql;

-- 削除されたヘルパーを確認
SELECT * FROM deleted_helpers ORDER BY deleted_at DESC;