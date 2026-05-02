// @ts-nocheck
// TODO: supabase.tsのDatabase型定義を更新し、@ts-nocheckを除去する
import { supabase } from '../lib/supabase';
import type { CareClient } from '../types';

interface KantankaigoCredentials {
  groupName: string;
  username: string;
  password: string;
}

interface KantankaigoClient {
  kantankaigoId: string;
  name: string;
  nameKana: string;
  childName: string;
  childNameKana: string;
  gender: 'male' | 'female';
  childGender: 'male' | 'female' | '';
  birthDate: string;
  childBirthDate: string;
  customerNumber: string;
  postalCode: string;
  address: string;
  phone: string;
  mobilePhone: string;
  contractStart: string;
  contractEnd: string;
  endReason: string;
  notes: string;
  emergencyContacts: Array<{
    name: string;
    birthDate: string;
    postalCode: string;
    address: string;
    phone: string;
    mobilePhone: string;
    relation: string;
  }>;
}

interface SyncResult {
  updated: number;
  created: number;
  skipped: number;
  errors: string[];
  details: Array<{
    name: string;
    action: 'updated' | 'created' | 'skipped';
    kantankaigoId: string;
  }>;
}

// かんたん介護からデータを取得
async function fetchFromKantankaigo(credentials: KantankaigoCredentials): Promise<KantankaigoClient[]> {
  const res = await fetch('/api/sync-kantankaigo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credentials }),
  });

  const json = await res.json();
  if (!json.success) {
    // デバッグ情報があればコンソールに出力
    if (json.debug) {
      console.log('🔍 かんたん介護ログインデバッグ:', JSON.stringify(json.debug, null, 2));
    }
    throw new Error(json.error || '取得に失敗しました');
  }

  return json.data;
}

// かんたん介護では契約終了利用者の名前末尾に「❌」等のマーカーが付くことがある。
// 同期時はこれを除去して比較・保存し、別利用者として扱われないようにする。
// 対応マーク: ❌ ❎ ✖ ✕ × ✗ ✘ 🅇 (および前後の空白)
const END_MARKER_REGEX = /[❌❎✖✕×✗✘🆇\s]+$/u;

function stripEndMarker(name: string): string {
  if (!name) return name;
  return name.replace(END_MARKER_REGEX, '').trim();
}

function hasEndMarker(name: string): boolean {
  if (!name) return false;
  return /[❌❎✖✕×✗✘🆇]/u.test(name);
}

// かんたん介護のデータをシフトソフトのCareClientにマッピング
function mapToUpdateFields(kantanClient: KantankaigoClient): Partial<CareClient> {
  const updates: Partial<CareClient> = {
    kantankaigoId: kantanClient.kantankaigoId,
    name: kantanClient.name,
    nameKana: kantanClient.nameKana,
    gender: kantanClient.gender,
    birthDate: kantanClient.birthDate,
    customerNumber: kantanClient.customerNumber,
    postalCode: kantanClient.postalCode,
    address: kantanClient.address,
    phone: kantanClient.phone,
    mobilePhone: kantanClient.mobilePhone,
    contractStart: kantanClient.contractStart,
    contractEnd: kantanClient.contractEnd,
    endReason: kantanClient.endReason,
    notes: kantanClient.notes,
  };

  // 名前末尾に❌等のマーカーが付いていて、かんたん介護側に明示的な終了理由が
  // 入っていない場合は、契約終了の事実が失われないように補完する。
  if (hasEndMarker(kantanClient.name) && !kantanClient.endReason) {
    updates.endReason = '契約終了';
  }

  // 児童情報（値がある場合のみ）
  if (kantanClient.childName) {
    updates.childName = kantanClient.childName;
    updates.childNameKana = kantanClient.childNameKana;
    updates.childGender = kantanClient.childGender || undefined;
    updates.childBirthDate = kantanClient.childBirthDate;
  }

  // 緊急連絡先
  const contacts = kantanClient.emergencyContacts;
  if (contacts.length > 0) {
    updates.emergencyContactName = contacts[0].name;
    updates.emergencyContactRelation = contacts[0].relation;
    updates.emergencyContactPhone = contacts[0].phone || contacts[0].mobilePhone;
  }
  if (contacts.length > 1) {
    updates.emergencyContact2Name = contacts[1].name;
    updates.emergencyContact2Relation = contacts[1].relation;
    updates.emergencyContact2Phone = contacts[1].phone || contacts[1].mobilePhone;
  }
  if (contacts.length > 2) {
    updates.emergencyContact3Name = contacts[2].name;
    updates.emergencyContact3Relation = contacts[2].relation;
    updates.emergencyContact3Phone = contacts[2].phone || contacts[2].mobilePhone;
  }

  return updates;
}

// 既存の利用者とかんたん介護のデータを名前で照合
function findMatchingClient(
  kantanClient: KantankaigoClient,
  existingClients: CareClient[]
): CareClient | undefined {
  // 1. kantankaigo_idで完全一致（最優先）
  const byId = existingClients.find(c => c.kantankaigoId === kantanClient.kantankaigoId);
  if (byId) return byId;

  // スペース・契約終了マーカー❌等を除去して比較するための正規化
  const normalize = (s: string) => stripEndMarker(s || '').replace(/\s+/g, '');
  const kantanName = normalize(kantanClient.name);
  const kantanChildName = normalize(kantanClient.childName);

  if (!kantanName) return undefined;

  // 2. 同姓同名で「親のみ利用者」と「親+児童利用者」が別人で存在しうるため、
  //    保護者名 + 児童名の組み合わせで一意に判定する
  //    (例: 山口貴子(児童なし) と 山口貴子(児童:山口純一) は別利用者)
  return existingClients.find(c => {
    if (normalize(c.name) !== kantanName) return false;
    return normalize(c.childName) === kantanChildName;
  });
}

// メイン同期処理
export async function syncFromKantankaigo(
  credentials: KantankaigoCredentials,
  onProgress?: (message: string, current: number, total: number) => void,
): Promise<SyncResult> {
  const result: SyncResult = { updated: 0, created: 0, skipped: 0, errors: [], details: [] };

  // 1. かんたん介護からデータ取得
  onProgress?.('かんたん介護にログイン中...', 0, 0);
  const kantanClients = await fetchFromKantankaigo(credentials);

  if (kantanClients.length === 0) {
    throw new Error('利用者が見つかりませんでした');
  }

  // 2. 既存の利用者を取得
  onProgress?.('シフトソフトの利用者を取得中...', 0, kantanClients.length);
  const { data: existingRows, error: loadError } = await supabase
    .from('users_care')
    .select('*')
    .eq('deleted', false);

  if (loadError) throw new Error(`利用者取得エラー: ${loadError.message}`);

  // DB行をCareClientにマッピング（loadCareClientsと同じ変換）
  const existingClients: CareClient[] = (existingRows || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    kantankaigoId: (row.kantankaigo_id as string) || '',
    kantankaigoOrder: (row.kantankaigo_order as number | null) ?? undefined,
    name: (row.name as string) || '',
    nameKana: (row.name_kana as string) || '',
    gender: (row.gender as 'male' | 'female') || 'male',
    birthDate: (row.birth_date as string) || '',
    customerNumber: (row.customer_number as string) || '',
    abbreviation: (row.abbreviation as string) || '',
    abbreviation2: (row.abbreviation2 as string) || '',
    postalCode: (row.postal_code as string) || '',
    address: (row.address as string) || '',
    phone: (row.phone as string) || '',
    mobilePhone: (row.mobile_phone as string) || '',
    contractStart: (row.contract_start as string) || '',
    contractEnd: (row.contract_end as string) || '',
    endReason: (row.end_reason as string) || '',
    emergencyContact: (row.emergency_contact as string) || '',
    emergencyContactName: (row.emergency_contact_name as string) || '',
    emergencyContactRelation: (row.emergency_contact_relation as string) || '',
    emergencyContactPhone: (row.emergency_contact_phone as string) || '',
    emergencyContact2Name: (row.emergency_contact2_name as string) || '',
    emergencyContact2Relation: (row.emergency_contact2_relation as string) || '',
    emergencyContact2Phone: (row.emergency_contact2_phone as string) || '',
    emergencyContact3Name: (row.emergency_contact3_name as string) || '',
    emergencyContact3Relation: (row.emergency_contact3_relation as string) || '',
    emergencyContact3Phone: (row.emergency_contact3_phone as string) || '',
    careLevel: (row.care_level as string) || '',
    area: (row.area as string) || '',
    childName: (row.child_name as string) || '',
    childNameKana: (row.child_name_kana as string) || '',
    childGender: (row.child_gender as 'male' | 'female') || undefined,
    childBirthDate: (row.child_birth_date as string) || '',
    shift1Name: (row.shift1_name as string) || '',
    notes: (row.notes as string) || '',
    services: (row.services as Record<string, unknown>) || {},
    billing: (row.billing as Record<string, unknown>) || {},
    deleted: (row.deleted as boolean) || false,
    deletedAt: (row.deleted_at as string) || undefined,
    createdAt: (row.created_at as string) || undefined,
    updatedAt: (row.updated_at as string) || undefined,
  }));

  // 3. 各利用者を同期
  for (let i = 0; i < kantanClients.length; i++) {
    const kantanClient = kantanClients[i];
    onProgress?.(
      `${kantanClient.name} を同期中...`,
      i + 1,
      kantanClients.length
    );

    try {
      const existing = findMatchingClient(kantanClient, existingClients);
      const updates = mapToUpdateFields(kantanClient);

      if (existing) {
        // 既存利用者を更新（abbreviation, abbreviation2, area等のシフトソフト固有フィールドは保持）
        const { error } = await supabase
          .from('users_care')
          .update({
            kantankaigo_id: updates.kantankaigoId,
            kantankaigo_order: i,
            name: updates.name,
            name_kana: updates.nameKana,
            gender: updates.gender,
            birth_date: updates.birthDate || null,
            customer_number: updates.customerNumber || null,
            postal_code: updates.postalCode || null,
            address: updates.address || null,
            phone: updates.phone || null,
            mobile_phone: updates.mobilePhone || null,
            contract_start: updates.contractStart || null,
            contract_end: updates.contractEnd || null,
            end_reason: updates.endReason || null,
            notes: updates.notes || null,
            child_name: updates.childName || null,
            child_name_kana: updates.childNameKana || null,
            child_gender: updates.childGender || null,
            child_birth_date: updates.childBirthDate || null,
            emergency_contact_name: updates.emergencyContactName || null,
            emergency_contact_relation: updates.emergencyContactRelation || null,
            emergency_contact_phone: updates.emergencyContactPhone || null,
            emergency_contact2_name: updates.emergencyContact2Name || null,
            emergency_contact2_relation: updates.emergencyContact2Relation || null,
            emergency_contact2_phone: updates.emergencyContact2Phone || null,
            emergency_contact3_name: updates.emergencyContact3Name || null,
            emergency_contact3_relation: updates.emergencyContact3Relation || null,
            emergency_contact3_phone: updates.emergencyContact3Phone || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (error) throw error;
        result.updated++;
        result.details.push({ name: kantanClient.name, action: 'updated', kantankaigoId: kantanClient.kantankaigoId });
      } else {
        // 新規作成
        const newId = crypto.randomUUID();
        const { error } = await supabase
          .from('users_care')
          .insert({
            id: newId,
            kantankaigo_id: updates.kantankaigoId,
            kantankaigo_order: i,
            name: updates.name || '名前未設定',
            name_kana: updates.nameKana || null,
            gender: updates.gender || 'male',
            birth_date: updates.birthDate || null,
            customer_number: updates.customerNumber || null,
            postal_code: updates.postalCode || null,
            address: updates.address || null,
            phone: updates.phone || null,
            mobile_phone: updates.mobilePhone || null,
            contract_start: updates.contractStart || null,
            contract_end: updates.contractEnd || null,
            end_reason: updates.endReason || null,
            notes: updates.notes || null,
            child_name: updates.childName || null,
            child_name_kana: updates.childNameKana || null,
            child_gender: updates.childGender || null,
            child_birth_date: updates.childBirthDate || null,
            emergency_contact_name: updates.emergencyContactName || null,
            emergency_contact_relation: updates.emergencyContactRelation || null,
            emergency_contact_phone: updates.emergencyContactPhone || null,
            emergency_contact2_name: updates.emergencyContact2Name || null,
            emergency_contact2_relation: updates.emergencyContact2Relation || null,
            emergency_contact2_phone: updates.emergencyContact2Phone || null,
            emergency_contact3_name: updates.emergencyContact3Name || null,
            emergency_contact3_relation: updates.emergencyContact3Relation || null,
            emergency_contact3_phone: updates.emergencyContact3Phone || null,
            services: {},
            billing: {},
            deleted: false,
            updated_at: new Date().toISOString(),
          });

        if (error) throw error;
        result.created++;
        result.details.push({ name: kantanClient.name, action: 'created', kantankaigoId: kantanClient.kantankaigoId });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${kantanClient.name}: ${msg}`);
      result.skipped++;
      result.details.push({ name: kantanClient.name, action: 'skipped', kantankaigoId: kantanClient.kantankaigoId });
    }
  }

  return result;
}

// 認証情報をSupabaseに保存
export async function saveKantankaigoCredentials(credentials: KantankaigoCredentials): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('ログインが必要です');

  const { error } = await supabase
    .from('kantankaigo_settings')
    .upsert({
      id: user.id,
      group_name: credentials.groupName,
      username: credentials.username,
      password: credentials.password,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

  if (error) throw error;
}

// 認証情報をSupabaseから取得
export async function loadKantankaigoCredentials(): Promise<KantankaigoCredentials | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('kantankaigo_settings')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !data) return null;

  return {
    groupName: data.group_name,
    username: data.username,
    password: data.password,
  };
}
