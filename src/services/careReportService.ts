import { supabase } from '../lib/supabase';
import type { CareReport, CareStatus } from '../types';

// 日誌一覧取得（日付範囲 + オプションフィルター）
export const loadCareReports = async (
  startDate: string,
  endDate: string,
  filters?: {
    helperId?: string;
    clientName?: string;
  }
): Promise<CareReport[]> => {
  let query = supabase
    .from('care_reports')
    .select('*, helpers!inner(name)')
    .gte('service_date', startDate)
    .lte('service_date', endDate)
    .order('service_date', { ascending: false })
    .order('start_time', { ascending: true });

  if (filters?.helperId) {
    query = query.eq('helper_id', filters.helperId);
  }
  if (filters?.clientName) {
    query = query.ilike('client_name', `%${filters.clientName}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error('日誌取得エラー:', error);
    throw error;
  }

  return (data ?? []) as CareReport[];
};

// 出発/到着ステータス取得（shift_idリストで一括取得）
export const loadCareStatuses = async (
  shiftIds: string[]
): Promise<CareStatus[]> => {
  if (shiftIds.length === 0) return [];

  const { data, error } = await supabase
    .from('care_status')
    .select('*')
    .in('shift_id', shiftIds);

  if (error) {
    console.error('ステータス取得エラー:', error);
    throw error;
  }

  return (data ?? []) as CareStatus[];
};

// 日誌削除（関連するcare_statusも削除）
export const deleteCareReport = async (
  reportId: string,
  shiftId: string
): Promise<void> => {
  const { error: statusError } = await supabase
    .from('care_status')
    .delete()
    .eq('shift_id', shiftId);

  if (statusError) {
    console.error('ステータス削除エラー:', statusError);
  }

  const { error } = await supabase
    .from('care_reports')
    .delete()
    .eq('id', reportId);

  if (error) {
    console.error('日誌削除エラー:', error);
    throw error;
  }
};

// 今日の日誌送信状況を取得（ダッシュボード用）
export const loadTodayCareReportSummary = async (
  today: string
): Promise<{
  reports: CareReport[];
  statuses: CareStatus[];
}> => {
  const [reportsResult, statusesResult] = await Promise.all([
    supabase
      .from('care_reports')
      .select('*, helpers!inner(name)')
      .eq('service_date', today)
      .order('start_time', { ascending: true }),
    supabase
      .from('care_status')
      .select('*')
      .gte('reported_at', `${today}T00:00:00`)
      .lte('reported_at', `${today}T23:59:59`),
  ]);

  if (reportsResult.error) {
    console.error('日誌サマリー取得エラー:', reportsResult.error);
    throw reportsResult.error;
  }
  if (statusesResult.error) {
    console.error('ステータスサマリー取得エラー:', statusesResult.error);
    throw statusesResult.error;
  }

  return {
    reports: (reportsResult.data ?? []) as CareReport[],
    statuses: (statusesResult.data ?? []) as CareStatus[],
  };
};
