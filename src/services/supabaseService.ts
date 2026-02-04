// @ts-nocheck
import { supabase } from '../lib/supabase';
import type { Helper, Shift } from '../types';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ヘルパーを保存
export const saveHelpers = async (helpers: Helper[]): Promise<void> => {
  try {
    // Supabaseでは upsert を使用して一括更新
    const dataToSave = helpers.map(helper => ({
      id: helper.id,
      name: helper.name,
      email: helper.email,
      hourly_wage: helper.hourlyRate || helper.baseHourlyRate || 2000,
      gender: helper.gender || 'male',
      display_name: helper.firstName ? `${helper.name} ${helper.firstName}` : helper.name,
      personal_token: helper.personalToken,
      order_index: helper.order || 0,
      role: helper.role,
      insurances: helper.insurances || [],
      standard_remuneration: helper.standardRemuneration || 0,
      deleted: false
    }));

    const { error } = await supabase
      .from('helpers')
      .upsert(dataToSave, { onConflict: 'id' });

    if (error) {
      console.error('ヘルパー保存エラー:', error);
      throw error;
    }

    // バックアップも作成
    await backupToSupabase('helpers', helpers, 'ヘルパー情報保存時のバックアップ');

    console.log('✅ ヘルパー保存成功');
  } catch (error) {
    console.error('ヘルパー保存エラー:', error);
    throw error;
  }
};

// ヘルパーを読み込み
export const loadHelpers = async (): Promise<Helper[]> => {
  try {
    const { data, error } = await supabase
      .from('helpers')
      .select('*')
      .eq('deleted', false)
      .order('order_index', { ascending: true });

    if (error) {
      console.error('ヘルパー読み込みエラー:', error);
      return [];
    }

    // データ形式を変換
    const helpers: Helper[] = (data || []).map(row => ({
      id: row.id,
      name: row.name,
      email: row.email || undefined,
      hourlyRate: row.hourly_wage || undefined,
      gender: row.gender as 'male' | 'female',
      personalToken: row.personal_token || undefined,
      order: row.order_index,
      role: row.role || undefined,
      insurances: row.insurances as any[] || [],
      standardRemuneration: row.standard_remuneration || 0
    }));

    return helpers;
  } catch (error) {
    console.error('ヘルパー読み込みエラー:', error);
    return [];
  }
};

// ヘルパーを論理削除
export const softDeleteHelper = async (helperId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('helpers')
      .update({
        deleted: true,
        deleted_at: new Date().toISOString()
      })
      .eq('id', helperId);

    if (error) {
      console.error('ヘルパー論理削除エラー:', error);
      throw error;
    }
  } catch (error) {
    console.error('ヘルパー論理削除エラー:', error);
    throw error;
  }
};

// シフトを保存（月ごと）
export const saveShiftsForMonth = async (year: number, month: number, shifts: Shift[]): Promise<void> => {
  try {
    const dataToSave = shifts.map(shift => ({
      id: shift.id,
      date: shift.date,
      start_time: shift.startTime,
      end_time: shift.endTime,
      helper_id: shift.helperId,
      client_name: shift.clientName,
      service_type: shift.serviceType,
      hours: shift.duration,
      hourly_wage: null, // 時給は別途ヘルパー情報から取得
      location: shift.area,
      cancel_status: shift.cancelStatus,
      canceled_at: shift.canceledAt,
      deleted: false
    }));

    const { error } = await supabase
      .from('shifts')
      .upsert(dataToSave, { onConflict: 'id' });

    if (error) {
      console.error('シフト保存エラー:', error);
      throw error;
    }

    // バックアップ作成
    await backupToSupabase('shifts', shifts, `${year}年${month}月のシフトバックアップ`);

    console.log(`✅ ${shifts.length}件のシフトを保存しました`);
  } catch (error) {
    console.error('シフト保存エラー:', error);
    throw error;
  }
};

// 月のシフトを読み込み
export const loadShiftsForMonth = async (year: number, month: number): Promise<Shift[]> => {
  try {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const { data, error } = await supabase
      .from('shifts')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('deleted', false);

    if (error) {
      console.error('シフト読み込みエラー:', error);
      return [];
    }

    // データ形式を変換
    const shifts: Shift[] = (data || []).map(row => ({
      id: row.id,
      date: row.date,
      startTime: row.start_time,
      endTime: row.end_time,
      helperId: row.helper_id || '',
      clientName: row.client_name,
      serviceType: row.service_type || undefined,
      duration: row.hours || 0,
      area: row.location || '',
      cancelStatus: row.cancel_status || undefined,
      canceledAt: row.canceled_at || undefined,
      deleted: row.deleted
    }));

    return shifts;
  } catch (error) {
    console.error('シフト読み込みエラー:', error);
    return [];
  }
};

// シフトを削除（完全削除）
export const deleteShift = async (shiftId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('shifts')
      .delete()
      .eq('id', shiftId);

    if (error) {
      console.error('シフト削除エラー:', error);
      throw error;
    }
  } catch (error) {
    console.error('シフト削除エラー:', error);
    throw error;
  }
};

// シフトを論理削除
export const softDeleteShift = async (shiftId: string, deletedBy?: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('shifts')
      .update({
        deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: deletedBy || 'unknown'
      })
      .eq('id', shiftId);

    if (error) {
      console.error('シフト論理削除エラー:', error);
      throw error;
    }
  } catch (error) {
    console.error('シフト論理削除エラー:', error);
    throw error;
  }
};

// キャンセル状態をクリア
export const clearCancelStatus = async (shiftId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('shifts')
      .update({
        cancel_status: null,
        canceled_at: null
      })
      .eq('id', shiftId);

    if (error) {
      console.error('キャンセル状態クリアエラー:', error);
      throw error;
    }
  } catch (error) {
    console.error('キャンセル状態クリアエラー:', error);
    throw error;
  }
};

// 休み希望を保存（月ごと）
export const saveDayOffRequests = async (year: number, month: number, requests: Map<string, string>): Promise<void> => {
  try {
    const docId = `${year}-${String(month).padStart(2, '0')}`;
    const requestsArray = Array.from(requests.entries()).map(([key, value]) => ({ key, value }));

    const { error } = await supabase
      .from('day_off_requests')
      .upsert({
        year_month: docId,
        requests: requestsArray
      }, { onConflict: 'year_month' });

    if (error) {
      console.error('休み希望保存エラー:', error);
      throw error;
    }

    console.log(`🏖️ 休み希望を保存しました: ${docId} (${requests.size}件)`);
  } catch (error) {
    console.error('休み希望保存エラー:', error);
    throw error;
  }
};

// 休み希望を読み込み（月ごと）
export const loadDayOffRequests = async (year: number, month: number): Promise<Map<string, string>> => {
  try {
    const docId = `${year}-${String(month).padStart(2, '0')}`;

    const { data, error } = await supabase
      .from('day_off_requests')
      .select('*')
      .eq('year_month', docId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('休み希望読み込みエラー:', error);
      return new Map();
    }

    const requests = new Map<string, string>();
    if (data?.requests && Array.isArray(data.requests)) {
      data.requests.forEach((item: any) => {
        requests.set(item.key, item.value);
      });
    }

    console.log(`🏖️ 休み希望を読み込みました: ${docId} (${requests.size}件)`);
    return requests;
  } catch (error) {
    console.error('休み希望読み込みエラー:', error);
    return new Map();
  }
};

// 指定休を保存（月ごと）
export const saveScheduledDayOffs = async (year: number, month: number, scheduledDayOffs: Map<string, boolean>): Promise<void> => {
  try {
    const docId = `${year}-${String(month).padStart(2, '0')}`;
    const scheduledDayOffsArray = Array.from(scheduledDayOffs.entries()).map(([key, value]) => ({ key, value }));

    const { error } = await supabase
      .from('scheduled_day_offs')
      .upsert({
        year_month: docId,
        scheduled_day_offs: scheduledDayOffsArray
      }, { onConflict: 'year_month' });

    if (error) {
      console.error('指定休保存エラー:', error);
      throw error;
    }

    console.log(`🟢 指定休を保存しました: ${docId} (${scheduledDayOffs.size}件)`);
  } catch (error) {
    console.error('指定休保存エラー:', error);
    throw error;
  }
};

// 指定休を読み込み（月ごと）
export const loadScheduledDayOffs = async (year: number, month: number): Promise<Map<string, boolean>> => {
  try {
    const docId = `${year}-${String(month).padStart(2, '0')}`;

    const { data, error } = await supabase
      .from('scheduled_day_offs')
      .select('*')
      .eq('year_month', docId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('指定休読み込みエラー:', error);
      return new Map();
    }

    const scheduledDayOffs = new Map<string, boolean>();
    if (data?.scheduled_day_offs && Array.isArray(data.scheduled_day_offs)) {
      data.scheduled_day_offs.forEach((item: any) => {
        scheduledDayOffs.set(item.key, item.value);
      });
    }

    console.log(`🟢 指定休を読み込みました: ${docId} (${scheduledDayOffs.size}件)`);
    return scheduledDayOffs;
  } catch (error) {
    console.error('指定休読み込みエラー:', error);
    return new Map();
  }
};

// 表示テキストを保存（月ごと）
export const saveDisplayTexts = async (year: number, month: number, displayTexts: Map<string, string>): Promise<void> => {
  try {
    const docId = `${year}-${String(month).padStart(2, '0')}`;
    const displayTextsArray = Array.from(displayTexts.entries()).map(([key, value]) => ({ key, value }));

    const { error } = await supabase
      .from('display_texts')
      .upsert({
        year_month: docId,
        display_texts: displayTextsArray
      }, { onConflict: 'year_month' });

    if (error) {
      console.error('表示テキスト保存エラー:', error);
      throw error;
    }

    console.log(`📝 表示テキストを保存しました: ${docId} (${displayTexts.size}件)`);
  } catch (error) {
    console.error('表示テキスト保存エラー:', error);
    throw error;
  }
};

// 表示テキストを読み込み（月ごと）
export const loadDisplayTexts = async (year: number, month: number): Promise<Map<string, string>> => {
  try {
    const docId = `${year}-${String(month).padStart(2, '0')}`;

    const { data, error } = await supabase
      .from('display_texts')
      .select('*')
      .eq('year_month', docId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('表示テキスト読み込みエラー:', error);
      return new Map();
    }

    const displayTexts = new Map<string, string>();
    if (data?.display_texts && Array.isArray(data.display_texts)) {
      data.display_texts.forEach((item: any) => {
        displayTexts.set(item.key, item.value);
      });
    }

    console.log(`📝 表示テキストを読み込みました: ${docId} (${displayTexts.size}件)`);
    return displayTexts;
  } catch (error) {
    console.error('表示テキスト読み込みエラー:', error);
    return new Map();
  }
};

// バックアップ作成
export const backupToSupabase = async (type: string, data: any, description?: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('backups')
      .insert({
        type,
        data: data,
        description: description || '自動バックアップ'
      });

    if (error) {
      console.error('バックアップ作成エラー:', error);
      throw error;
    }
  } catch (error) {
    console.error('バックアップ作成エラー:', error);
    throw error;
  }
};

// リアルタイムサブスクリプション：ヘルパー
export const subscribeToHelpers = (onUpdate: (helpers: Helper[]) => void): RealtimeChannel => {
  const channel = supabase
    .channel('helpers-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'helpers' },
      async () => {
        const helpers = await loadHelpers();
        onUpdate(helpers);
      }
    )
    .subscribe();

  return channel;
};

// リアルタイムサブスクリプション：シフト
export const subscribeToShiftsForMonth = (
  year: number,
  month: number,
  onUpdate: (shifts: Shift[]) => void
): RealtimeChannel => {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const channel = supabase
    .channel(`shifts-${year}-${month}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'shifts',
        filter: `date=gte.${startDate},date=lte.${endDate}`
      },
      async () => {
        const shifts = await loadShiftsForMonth(year, month);
        onUpdate(shifts);
      }
    )
    .subscribe();

  return channel;
};

// リアルタイムサブスクリプション：休み希望
export const subscribeToDayOffRequestsMap = (
  year: number,
  month: number,
  onUpdate: (requests: Map<string, string>) => void
): RealtimeChannel => {
  const docId = `${year}-${String(month).padStart(2, '0')}`;

  const channel = supabase
    .channel(`dayoff-${docId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'day_off_requests',
        filter: `year_month=eq.${docId}`
      },
      async () => {
        const requests = await loadDayOffRequests(year, month);
        onUpdate(requests);
      }
    )
    .subscribe();

  return channel;
};

// リアルタイムサブスクリプション：指定休
export const subscribeToScheduledDayOffs = (
  year: number,
  month: number,
  onUpdate: (scheduledDayOffs: Map<string, boolean>) => void
): RealtimeChannel => {
  const docId = `${year}-${String(month).padStart(2, '0')}`;

  const channel = supabase
    .channel(`scheduled-${docId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'scheduled_day_offs',
        filter: `year_month=eq.${docId}`
      },
      async () => {
        const scheduledDayOffs = await loadScheduledDayOffs(year, month);
        onUpdate(scheduledDayOffs);
      }
    )
    .subscribe();

  return channel;
};

// リアルタイムサブスクリプション：表示テキスト
export const subscribeToDisplayTextsMap = (
  year: number,
  month: number,
  onUpdate: (texts: Map<string, string>) => void
): RealtimeChannel => {
  const docId = `${year}-${String(month).padStart(2, '0')}`;

  const channel = supabase
    .channel(`display-${docId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'display_texts',
        filter: `year_month=eq.${docId}`
      },
      async () => {
        const texts = await loadDisplayTexts(year, month);
        onUpdate(texts);
      }
    )
    .subscribe();

  return channel;
};

// 3ヶ月分のシフトを一括取得
export const loadShiftsForThreeMonths = async (
  year: number,
  month: number,
  helperId?: string
): Promise<Shift[]> => {
  try {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;

    const [prevShifts, currentShifts, nextShifts] = await Promise.all([
      loadShiftsForMonth(prevYear, prevMonth),
      loadShiftsForMonth(year, month),
      loadShiftsForMonth(nextYear, nextMonth)
    ]);

    let allShifts = [...prevShifts, ...currentShifts, ...nextShifts];

    if (helperId) {
      allShifts = allShifts.filter(shift => shift.helperId === helperId);
    }

    return allShifts;
  } catch (error) {
    console.error('3ヶ月分のシフト取得エラー:', error);
    return [];
  }
};

// トークンでヘルパーを検索
export const loadHelperByToken = async (token: string): Promise<Helper | null> => {
  try {
    const { data, error } = await supabase
      .from('helpers')
      .select('*')
      .eq('personal_token', token)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('ヘルパー取得エラー:', error);
      return null;
    }

    if (!data) {
      return null;
    }

    const helper: Helper = {
      id: data.id,
      name: data.name,
      email: data.email || undefined,
      hourlyRate: data.hourly_wage || undefined,
      gender: data.gender as 'male' | 'female',
      personalToken: data.personal_token || undefined,
      order: data.order_index,
      role: data.role || undefined,
      insurances: data.insurances as any[] || [],
      standardRemuneration: data.standard_remuneration || 0
    };

    return helper;
  } catch (error) {
    console.error('ヘルパー取得エラー:', error);
    return null;
  }
};
// 個別シフトを保存
export const saveShift = async (shift: Shift): Promise<void> => {
  try {
    const { error } = await supabase
      .from('shifts')
      .upsert({
        id: shift.id,
        date: shift.date,
        start_time: shift.startTime,
        end_time: shift.endTime,
        helper_id: shift.helperId,
        client_name: shift.clientName,
        service_type: shift.serviceType,
        hours: shift.duration,
        hourly_wage: null,
        location: shift.area,
        cancel_status: shift.cancelStatus,
        canceled_at: shift.canceledAt,
        deleted: shift.deleted || false
      });

    if (error) {
      console.error('シフト保存エラー:', error);
      throw error;
    }
  } catch (error) {
    console.error('シフト保存エラー:', error);
    throw error;
  }
};

// シフトを復元（論理削除を取り消し）
export const restoreShift = async (shiftId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('shifts')
      .update({
        deleted: false,
        deleted_at: null,
        deleted_by: null
      })
      .eq('id', shiftId);

    if (error) {
      console.error('シフト復元エラー:', error);
      throw error;
    }
  } catch (error) {
    console.error('シフト復元エラー:', error);
    throw error;
  }
};

// シフトを移動（Firestore互換の引数形式）
export const moveShift = async (
  sourceShiftId: string,
  newShift: Shift | string,
  collectionName?: string
): Promise<void> => {
  try {
    // newShiftがShiftオブジェクトの場合
    if (typeof newShift === 'object') {
      // 既存のシフトを削除
      await softDeleteShift(sourceShiftId);
      // 新しいシフトを作成
      await saveShift(newShift);
    }
    // newShiftが日付文字列の場合（簡易版）
    else if (typeof newShift === 'string') {
      const { error } = await supabase
        .from('shifts')
        .update({
          date: newShift,
          updated_at: new Date().toISOString()
        })
        .eq('id', sourceShiftId);

      if (error) {
        console.error('シフト移動エラー:', error);
        throw error;
      }
    }
  } catch (error) {
    console.error('シフト移動エラー:', error);
    throw error;
  }
};

// Firebase互換のバックアップ関数（Supabaseの場合は同じ）
export const backupToFirebase = backupToSupabase;
