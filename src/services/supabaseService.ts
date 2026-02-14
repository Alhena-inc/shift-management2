// @ts-nocheck
// TODO: supabase.tsのDatabase型定義を更新し、@ts-nocheckを除去する
import { supabase } from '../lib/supabase';
import type { Helper, Shift } from '../types';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ヘルパーを保存
export const saveHelpers = async (helpers: Helper[]): Promise<void> => {
  try {
    console.log('📝 ヘルパー保存開始:', helpers.length, '件');

    // 空の配列の場合は何もしない
    if (!helpers || helpers.length === 0) {
      console.warn('⚠️ 保存するヘルパーがありません');
      return;
    }

    // Supabaseでは upsert を使用して一括更新
    const dataToSave = helpers.map(helper => {
      // IDがない場合は新規生成
      const helperId = helper.id || crypto.randomUUID();

      // 個人情報をログに含めない

      // 数値フィールドが文字列の場合を考慮
      const hourlyWage = typeof helper.hourlyRate === 'string'
        ? parseFloat(helper.hourlyRate) || 0
        : helper.hourlyRate || 0;

      // Supabaseに送信するデータ（全フィールド対応）
      const saveData: any = {
        id: helperId,
        name: helper.name || '名前未設定',
        order_index: helper.order ?? 0,
        deleted: false,
        updated_at: new Date().toISOString(),

        // 基本情報
        last_name: helper.lastName || null,
        first_name: helper.firstName || null,
        name_kana: helper.nameKana || null,
        gender: helper.gender || 'male',
        birth_date: helper.birthDate || null,
        postal_code: helper.postalCode || null,
        address: helper.address || null,
        phone: helper.phone || null,
        emergency_contact: helper.emergencyContact || null,
        emergency_contact_phone: helper.emergencyContactPhone || null,

        // 権限・アカウント
        role: helper.role || 'staff',
        personal_token: helper.personalToken || null,
        spreadsheet_gid: helper.spreadsheetGid || null,

        // 雇用・給与タイプ
        salary_type: helper.salaryType || 'hourly',
        employment_type: helper.employmentType || 'parttime',
        hire_date: helper.hireDate || null,
        department: helper.department || null,
        status: helper.status || 'active',
        cash_payment: helper.cashPayment || false,

        // 時給制
        hourly_rate: hourlyWage,
        treatment_improvement_per_hour: helper.treatmentImprovementPerHour || 0,
        office_hourly_rate: helper.officeHourlyRate || 1000,

        // 固定給制
        base_salary: helper.baseSalary || 0,
        treatment_allowance: helper.treatmentAllowance || 0,
        other_allowances: helper.otherAllowances || [],

        // 税務情報
        dependents: helper.dependents || 0,
        resident_tax_type: helper.residentTaxType || 'special',
        residential_tax: helper.residentialTax || 0,
        age: helper.age || null,
        standard_remuneration: helper.standardRemuneration || 0,
        has_withholding_tax: helper.hasWithholdingTax !== false,
        tax_column_type: helper.taxColumnType || 'main',
        contract_period: helper.contractPeriod || null,

        // 資格・スキル
        qualifications: helper.qualifications || [],
        qualification_dates: helper.qualificationDates || {},
        service_types: helper.serviceTypes || [],
        commute_methods: helper.commuteMethods || [],

        // 保険
        insurances: helper.insurances || [],

        // 勤怠テンプレート
        attendance_template: helper.attendanceTemplate || {
          enabled: false,
          weekday: { startTime: '09:00', endTime: '18:00', breakMinutes: 60 },
          excludeWeekends: true,
          excludeHolidays: false,
          excludedDateRanges: []
        },

        // 月別支払いデータ（交通費・経費・手当・返済）
        monthly_payments: helper.monthlyPayments || {}
      };

      // emailは空文字の場合はnullにする
      if (helper.email && helper.email.trim() !== '') {
        saveData.email = helper.email;
      } else {
        saveData.email = null;
      }

      // デバッグ用: IDのみ出力（個人情報を含めない）

      return saveData;
    });

    // デバッグログは最小限に抑える（個人情報を含まない）
    // console.log('📤 Supabaseに送信するデータ:', JSON.stringify(dataToSave, null, 2));

    // 各ヘルパーを個別に保存（エラーの特定を容易にするため）
    const results = [];
    for (const helperData of dataToSave) {
      // 個人名をログに出力しない
      // console.log(`💾 保存中: ${helperData.name}`);

      const { data, error } = await supabase
        .from('helpers')
        .upsert(helperData);

      if (error) {
        // エラー時も個人情報を含めない
        console.error('ヘルパー保存エラー:', {
          message: error.message,
          code: error.code
        });

        // 400エラーの詳細を解析
        if (error.message && error.message.includes('column')) {
          console.error('⚠️ カラムエラー: テーブル構造の不一致の可能性');
        }

        // エラーでも続行（他のヘルパーは保存を試みる）
        results.push({ helperId: helperData.id, status: 'error', error });
      } else {
        // 成功時も個人名を出力しない
        // console.log(`✅ ${helperData.name} を保存しました`);
        results.push({ helperId: helperData.id, status: 'success' });
      }
    }

    // エラーがあった場合は警告（個人情報を含まない）
    const errors = results.filter(r => r.status === 'error');
    if (errors.length > 0) {
      console.error(`⚠️ ${errors.length}/${dataToSave.length}件の保存に失敗`);

      // 全て失敗した場合はエラーをスロー
      if (errors.length === dataToSave.length) {
        throw new Error('全てのヘルパーの保存に失敗しました。Supabaseの接続を確認してください。');
      }
    }

    // バックアップも作成（サイレントに実行）
    await backupToSupabase('helpers', helpers, 'ヘルパー情報保存時のバックアップ');

    // 成功時のログも簡潔に
    const successCount = results.filter(r => r.status === 'success').length;
    if (successCount > 0) {
      console.log(`✅ ${successCount}件保存完了`);
    }
  } catch (error) {
    console.error('ヘルパー保存エラー:', error);
    throw error;
  }
};

// ヘルパーを読み込み
export const loadHelpers = async (): Promise<Helper[]> => {
  try {
    console.log('📥 ヘルパー読み込み開始...');

    // 全カラムを選択（新しく追加したカラムも含む）
    const { data, error } = await supabase
      .from('helpers')
      .select('*')
      .order('order_index', { ascending: true });

    if (error) {
      console.error('❌ ヘルパー読み込みエラー:', error);
      console.error('エラー詳細:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });

      // フォールバック: 最小限のカラムで再試行
      console.log('⚠️ フォールバック: 最小限のカラムで再試行');
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('helpers')
        .select('id, name, email, hourly_wage, order_index')
        .order('order_index', { ascending: true });

      if (fallbackError) {
        console.error('フォールバックも失敗:', fallbackError);
        throw new Error('ヘルパー読み込み失敗: ' + fallbackError.message);
      }

      // フォールバックデータを使用（genderはデフォルト値）
      return (fallbackData || []).map(row => ({
        id: row.id,
        name: row.name,
        email: row.email || undefined,
        hourlyRate: row.hourly_wage || undefined,
        gender: 'male' as 'male' | 'female', // デフォルト値
        order: row.order_index || 0
      }));
    }

    // データ形式を変換（全フィールド対応）
    const helpers: Helper[] = (data || [])
      .filter(row => !row.deleted) // 削除済みを除外
      .map(row => {
        // 個人情報をログに含めない
        return {
          // 基本フィールド
          id: row.id,
          name: row.name,
          order: row.order_index || 0,

          // 基本情報
          lastName: row.last_name || undefined,
          firstName: row.first_name || undefined,
          nameKana: row.name_kana || undefined,
          gender: (row.gender || 'male') as 'male' | 'female',
          birthDate: row.birth_date || undefined,
          postalCode: row.postal_code || undefined,
          address: row.address || undefined,
          phone: row.phone || undefined,
          email: row.email || undefined,
          emergencyContact: row.emergency_contact || undefined,
          emergencyContactPhone: row.emergency_contact_phone || undefined,

          // 権限・アカウント
          role: row.role || 'staff',
          personalToken: row.personal_token || undefined,
          spreadsheetGid: row.spreadsheet_gid || undefined,

          // 雇用・給与タイプ
          salaryType: row.salary_type || 'hourly',
          employmentType: row.employment_type || 'parttime',
          hireDate: row.hire_date || undefined,
          department: row.department || undefined,
          status: row.status || 'active',
          cashPayment: row.cash_payment || false,

          // 時給制
          hourlyRate: row.hourly_rate || row.hourly_wage || 2000,
          treatmentImprovementPerHour: row.treatment_improvement_per_hour || 0,
          officeHourlyRate: row.office_hourly_rate || 1000,

          // 固定給制
          baseSalary: row.base_salary || 0,
          treatmentAllowance: row.treatment_allowance || 0,
          otherAllowances: row.other_allowances || [],

          // 税務情報
          dependents: row.dependents || 0,
          residentTaxType: row.resident_tax_type || 'special',
          residentialTax: row.residential_tax || 0,
          age: row.age || undefined,
          standardRemuneration: row.standard_remuneration || 0,
          hasWithholdingTax: row.has_withholding_tax !== false,
          taxColumnType: row.tax_column_type || 'main',
          contractPeriod: row.contract_period || undefined,

          // 資格・スキル
          qualifications: row.qualifications || [],
          qualificationDates: row.qualification_dates || {},
          serviceTypes: row.service_types || [],
          commuteMethods: row.commute_methods || [],

          // 保険
          insurances: row.insurances as any[] || [],

          // 勤怠テンプレート
          attendanceTemplate: row.attendance_template || {
            enabled: false,
            weekday: { startTime: '09:00', endTime: '18:00', breakMinutes: 60 },
            excludeWeekends: true,
            excludeHolidays: false,
            excludedDateRanges: []
          },

          // 月別支払いデータ（交通費・経費・手当・返済）
          monthlyPayments: row.monthly_payments || {}
        };
      });

    return helpers;
  } catch (error) {
    console.error('ヘルパー読み込みエラー:', error);
    throw error;
  }
};

// ヘルパーを削除（deleted_helpersテーブルに移動）
export const softDeleteHelper = async (helperId: string, deletedBy?: string): Promise<void> => {
  try {
    console.log(`🗑️ ヘルパーを削除テーブルに移動中: ${helperId}`);

    // 1. まず現在のヘルパー情報を取得
    const { data: helper, error: fetchError } = await supabase
      .from('helpers')
      .select('*')
      .eq('id', helperId)
      .single();

    if (fetchError || !helper) {
      console.error('ヘルパー取得エラー:', fetchError);
      throw new Error('ヘルパーが見つかりません');
    }

    // 2. deleted_helpersテーブルにデータをコピー
    const { error: insertError } = await supabase
      .from('deleted_helpers')
      .insert({
        original_id: helper.id,
        name: helper.name,
        email: helper.email,
        hourly_wage: helper.hourly_wage,
        order_index: helper.order_index,
        gender: helper.gender,
        personal_token: helper.personal_token,
        role: helper.role,
        insurances: helper.insurances,
        standard_remuneration: helper.standard_remuneration,
        deleted_by: deletedBy || 'unknown',
        deletion_reason: '手動削除',
        original_created_at: helper.created_at,
        original_updated_at: helper.updated_at
      });

    if (insertError) {
      // deleted_helpersテーブルが存在しない場合のエラーハンドリング
      if (insertError.code === '42P01') { // テーブルが存在しないエラー
        console.error('⚠️ deleted_helpersテーブルが存在しません。create-deleted-tables.sqlを実行してください');
        console.warn('削除をキャンセルします（データ保護のため）');
        return;
      }
      console.error('削除済みテーブルへの挿入エラー:', insertError);
      throw insertError;
    }

    // 3. 元のhelpersテーブルから削除
    const { error: deleteError } = await supabase
      .from('helpers')
      .delete()
      .eq('id', helperId);

    if (deleteError) {
      console.error('元テーブルからの削除エラー:', deleteError);
      // ロールバック的な処理（deleted_helpersから削除）
      await supabase
        .from('deleted_helpers')
        .delete()
        .eq('original_id', helperId);
      throw deleteError;
    }

    console.log(`✅ ヘルパーを削除済みテーブルに移動しました (ID: ${helperId})`);
  } catch (error) {
    console.error('ヘルパー削除エラー:', error);
    throw error;
  }
};

// 削除済みヘルパーを取得
export const loadDeletedHelpers = async (): Promise<any[]> => {
  try {
    const { data, error } = await supabase
      .from('deleted_helpers')
      .select('*')
      .order('deleted_at', { ascending: false });

    if (error) {
      console.error('削除済みヘルパー取得エラー:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('削除済みヘルパー取得エラー:', error);
    return [];
  }
};

// ヘルパーを復元（deleted_helpersからhelpersに戻す）
export const restoreHelper = async (deletedHelperId: string): Promise<void> => {
  try {
    console.log(`♻️ ヘルパーを復元中: ${deletedHelperId}`);

    // 1. deleted_helpersから該当データを取得
    const { data: deletedHelper, error: fetchError } = await supabase
      .from('deleted_helpers')
      .select('*')
      .eq('id', deletedHelperId)
      .single();

    if (fetchError || !deletedHelper) {
      console.error('削除済みヘルパー取得エラー:', fetchError);
      throw new Error('削除済みヘルパーが見つかりません');
    }

    // 2. helpersテーブルに復元（元のIDを使用）
    const { error: insertError } = await supabase
      .from('helpers')
      .insert({
        id: deletedHelper.original_id || undefined, // 元のIDがあれば使用
        name: deletedHelper.name,
        email: deletedHelper.email,
        hourly_wage: deletedHelper.hourly_wage,
        order_index: deletedHelper.order_index,
        gender: deletedHelper.gender,
        personal_token: deletedHelper.personal_token,
        role: deletedHelper.role,
        insurances: deletedHelper.insurances,
        standard_remuneration: deletedHelper.standard_remuneration,
        created_at: deletedHelper.original_created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (insertError) {
      console.error('ヘルパー復元エラー:', insertError);
      throw insertError;
    }

    // 3. deleted_helpersから削除
    const { error: deleteError } = await supabase
      .from('deleted_helpers')
      .delete()
      .eq('id', deletedHelperId);

    if (deleteError) {
      console.error('削除済みテーブルからの削除エラー:', deleteError);
      // ロールバック（helpersから削除）
      if (deletedHelper.original_id) {
        await supabase
          .from('helpers')
          .delete()
          .eq('id', deletedHelper.original_id);
      }
      throw deleteError;
    }

    console.log(`✅ ヘルパーを復元しました (ID: ${deletedHelperId})`);
  } catch (error) {
    console.error('ヘルパー復元エラー:', error);
    throw error;
  }
};

// シフトを保存（月ごと）
export const saveShiftsForMonth = async (year: number, month: number, shifts: Shift[]): Promise<void> => {
  try {
    console.log(`📝 [Supabase] シフト保存開始: ${year}年${month}月, ${shifts.length}件`);
    const dataToSave = shifts.map(shift => {
      // 時刻のバリデーションとフォーマット
      const formatTime = (time: string | undefined | null): string | null => {
        if (!time || time === '') return null;
        // HH:mm形式の時刻をHH:mm:ss形式に変換
        if (/^\d{1,2}:\d{2}$/.test(time)) {
          const [hours, minutes] = time.split(':');
          const h = hours.padStart(2, '0');
          const m = minutes.padStart(2, '0');
          return `${h}:${m}:00`;
        }
        // HH:mm:ss形式の場合はそのまま
        if (/^\d{1,2}:\d{2}:\d{2}$/.test(time)) {
          const [hours, minutes, seconds] = time.split(':');
          const h = hours.padStart(2, '0');
          const m = minutes.padStart(2, '0');
          const s = seconds.padStart(2, '0');
          return `${h}:${m}:${s}`;
        }
        return null;
      };

      // 予定タイプを判定（clientNameとcontentから）
      // ケア系サービスタイプの定義
      const careServiceTypes = ['shintai', 'kaji', 'seikatsu', 'doukou', 'idou'];
      const isCareService = shift.serviceType && careServiceTypes.includes(shift.serviceType);

      // 予定・会議系のキーワード（大文字小文字のバリエーション含む）
      const yoteiKeywords = ['会議', '予定', '研修', '面談', 'ミーティング', 'WEB', 'Web', 'web', 'オンライン', '打合せ', '打ち合わせ'];

      const isYotei =
        shift.serviceType === 'yotei' ||
        shift.serviceType === 'kaigi' ||
        (shift.clientName && (
          shift.clientName.includes('(会議)') ||
          shift.clientName.includes('(予定)') ||
          shift.clientName.includes('(研修)') ||
          shift.clientName.includes('(面談)') ||
          shift.clientName.includes('(ミーティング)') ||
          yoteiKeywords.some(keyword => shift.clientName.includes(keyword))
        )) ||
        (shift.content && yoteiKeywords.some(keyword => shift.content.includes(keyword))) ||
        // サービスタイプがない場合、ケア系サービスでなければ予定として扱う
        (!shift.serviceType && !isCareService);

      // 予定の場合、終了時間がなければ開始時間と同じにする
      const formattedStartTime = formatTime(shift.startTime);
      const formattedEndTime = formatTime(shift.endTime);

      return {
        id: shift.id,
        date: shift.date,
        start_time: formattedStartTime || '00:00:00', // nullの場合はデフォルト値
        end_time: formattedEndTime || formattedStartTime || '00:00:00', // nullの場合は開始時間を使用、それもなければデフォルト値
        helper_id: shift.helperId,
        client_name: shift.clientName || '',
        service_type: isYotei ? 'yotei' : (shift.serviceType || 'shintai'),
        hours: isYotei ? 0 : (shift.duration || 0), // 予定の場合は時間数0
        hourly_wage: null, // 時給は別途ヘルパー情報から取得
        location: shift.area || '',
        content: shift.content || null, // ケア内容（自由入力）
        row_index: shift.rowIndex ?? null, // 表示行インデックス
        cancel_status: shift.cancelStatus || 'none',
        // FirestoreのTimestampをISO文字列に変換
        canceled_at: shift.canceledAt ?
          (typeof shift.canceledAt === 'object' && 'toDate' in shift.canceledAt
            ? shift.canceledAt.toDate().toISOString()
            : shift.canceledAt)
          : null,
        deleted: shift.deleted || false,
        // FirestoreのTimestampをISO文字列に変換
        deleted_at: shift.deletedAt ?
          (typeof shift.deletedAt === 'object' && 'toDate' in shift.deletedAt
            ? shift.deletedAt.toDate().toISOString()
            : shift.deletedAt)
          : null,
        deleted_by: shift.deletedBy || null
      };
    });

    console.log(`📝 ${year}年${month}月のシフトを保存中...`);
    console.log(`  保存するシフト数: ${dataToSave.length}件`);

    // 月別にデータを確認（デバッグ用）
    const monthGroups = dataToSave.reduce((groups, shift) => {
      const month = shift.date.substring(0, 7); // YYYY-MM形式
      if (!groups[month]) groups[month] = 0;
      groups[month]++;
      return groups;
    }, {} as Record<string, number>);

    console.log('  月別シフト数:', monthGroups);

    // 空のデータは保存しない
    const validData = dataToSave.filter(shift =>
      shift.helper_id && shift.date && shift.id
    );

    if (validData.length === 0) {
      console.log('保存するデータがありません');
      return;
    }

    // データのバリデーション
    validData.forEach((data, index) => {
      if (data.start_time && !/^\d{2}:\d{2}:\d{2}$/.test(data.start_time)) {
        console.error(`不正な開始時刻 (index ${index}):`, data.start_time);
        data.start_time = null;
      }
      if (data.end_time && !/^\d{2}:\d{2}:\d{2}$/.test(data.end_time)) {
        console.error(`不正な終了時刻 (index ${index}):`, data.end_time);
        data.end_time = null;
      }
    });

    const { data: savedData, error } = await supabase
      .from('shifts')
      .upsert(validData, { onConflict: 'id' })
      .select();

    if (error) {
      console.error('❌ シフト保存エラー:', error);
      console.error('エラー詳細:', JSON.stringify(error, null, 2));
      console.error('保存しようとしたデータ例:', validData[0]);
      // エラーを再スローしない（UIをブロックしない）
      return;
    }

    // バックアップ作成
    await backupToSupabase('shifts', shifts, `${year}年${month}月のシフトバックアップ`);

    console.log(`✅ [Supabase] ${shifts.length}件のシフト保存完了`);
    console.log(`  実際に保存された件数: ${savedData?.length || 0}件`);
  } catch (error) {
    console.error('シフト保存エラー:', error);
    throw error;
  }
};

// 月のシフトを読み込み（リトライ機能付き）
export const loadShiftsForMonth = async (year: number, month: number, retryCount: number = 3): Promise<Shift[]> => {
  let lastError: any = null;

  for (let attempt = 1; attempt <= retryCount; attempt++) {
    try {
      console.log(`📅 ${year}年${month}月のシフトを読み込み中... (試行 ${attempt}/${retryCount})`);
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      // month は 1-indexed で、new Date(year, month, 0) は month の最終日を返す
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      console.log(`  期間: ${startDate} 〜 ${endDate}`);

      // deletedカラムが存在しない場合に備えて一時的に無効化
      // TODO: Supabaseでadd-deleted-column-to-shifts.sqlを実行後に有効化
      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true })
        .order('row_index', { ascending: true });
      // .eq('deleted', false); // 一時的にコメントアウト（deletedカラムがない場合のエラー回避）

      if (error) {
        console.error(`シフト読み込みエラー (試行 ${attempt}):`, error);
        console.error('エラー詳細:', JSON.stringify(error, null, 2));
        lastError = error;

        // リトライ前に少し待機（指数バックオフ）
        if (attempt < retryCount) {
          const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          console.log(`  ${waitTime}ms後に再試行します...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }

        return [];
      }

      // データ取得成功
      console.log(`  ✅ 取得したシフト数: ${data?.length || 0}件`);

      // 時間形式からHH:MMのみを抽出（Supabaseのtime型はHH:MM:SS形式で返される）
      const formatTimeToHHMM = (time: string | null): string | undefined => {
        if (!time) return undefined;
        // HH:MM:SS → HH:MM に変換
        return time.substring(0, 5);
      };

      // データ形式を変換
      const shifts: Shift[] = (data || []).map(row => ({
        id: row.id,
        date: row.date,
        startTime: formatTimeToHHMM(row.start_time),
        endTime: formatTimeToHHMM(row.end_time),
        helperId: row.helper_id || '',
        clientName: row.client_name,
        serviceType: row.service_type || undefined,
        duration: row.hours || 0,
        area: row.location || '',
        content: row.content || undefined, // ケア内容（自由入力）
        rowIndex: row.row_index ?? undefined, // 表示行インデックス
        cancelStatus: row.cancel_status || undefined,
        canceledAt: row.canceled_at || undefined,
        deleted: row.deleted || false // deletedカラムがない場合はfalseとする
      }));

      // deletedがtrueのものをフィルタリング（アプリ側で処理）
      const activeShifts = shifts.filter(s => !s.deleted);
      console.log(`  論理削除を除いたシフト数: ${activeShifts.length}件`);

      return activeShifts;

    } catch (error) {
      console.error(`シフト読み込みエラー (試行 ${attempt}):`, error);
      lastError = error;

      // リトライ前に少し待機
      if (attempt < retryCount) {
        const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`  ${waitTime}ms後に再試行します...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  // すべての試行が失敗した場合
  console.error('❌ すべての試行が失敗しました:', lastError);
  return [];
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

    // console.log(`🏖️ 休み希望を保存: ${requests.size}件`);
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

    // console.log(`🟢 指定休を保存: ${scheduledDayOffs.size}件`);
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

    // console.log(`📝 表示テキストを保存: ${displayTexts.size}件`);
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
// onUpdate の引数が null の場合は読み込みエラーを意味する
export const subscribeToHelpers = (onUpdate: (helpers: Helper[] | null) => void): RealtimeChannel => {
  // 初回データを読み込む（リトライ付き）
  const loadWithRetry = async (retries = 3, delay = 2000): Promise<void> => {
    for (let i = 0; i < retries; i++) {
      try {
        const helpers = await loadHelpers();
        onUpdate(helpers);
        return;
      } catch (error) {
        console.error(`ヘルパー読み込み試行 ${i + 1}/${retries} 失敗:`, error);
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    console.error('ヘルパー初回読み込み: 全リトライ失敗');
    onUpdate(null);
  };

  loadWithRetry();

  const channel = supabase
    .channel('helpers-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'helpers' },
      async () => {
        try {
          const helpers = await loadHelpers();
          onUpdate(helpers);
        } catch (error) {
          console.error('ヘルパーリアルタイム更新エラー:', error);
          // リアルタイム更新のエラーは無視（既存データを保持）
        }
      }
    )
    .subscribe((status) => {
      // console.log(`  購読ステータス: ${status}`);
    });

  return channel;
};

// リアルタイムサブスクリプション：シフト
export const subscribeToShiftsForMonth = (
  year: number,
  month: number,
  onUpdate: (shifts: Shift[]) => void
): RealtimeChannel => {
  // console.log(`🔄 Supabaseサブスクリプション開始: ${year}年${month}月`);

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  // console.log(`  購読期間: ${startDate} 〜 ${endDate}`);

  // 初回データを即座に読み込む
  loadShiftsForMonth(year, month).then(shifts => {
    // console.log(`  初回読み込み: ${shifts.length}件`);
    onUpdate(shifts);
  }).catch(error => {
    console.error('初回読み込みエラー:', error);
  });

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
        // console.log(`  📡 更新を検知`);
        const shifts = await loadShiftsForMonth(year, month);
        onUpdate(shifts);
      }
    )
    .subscribe((status) => {
      // console.log(`  購読ステータス: ${status}`);
    });

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
        // FirestoreのTimestampをISO文字列に変換
        canceled_at: shift.canceledAt ?
          (typeof shift.canceledAt === 'object' && 'toDate' in shift.canceledAt
            ? shift.canceledAt.toDate().toISOString()
            : shift.canceledAt)
          : null,
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
      // 既存のシフトを論理削除（deleted: trueにマーク）
      const { error: deleteError } = await supabase
        .from('shifts')
        .update({
          deleted: true,
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', sourceShiftId);

      if (deleteError) {
        console.error('Failed to mark source shift as deleted:', deleteError);
        throw deleteError;
      }

      // 新しいシフトを作成（正しい年月のデータとして保存）
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

// 日付ごとのシフト数を取得
export const getShiftsCountByDate = async (year: number, month: number, day: number): Promise<number> => {
  try {
    const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    console.log(`📊 Supabaseから${dateString}のシフト数を確認中...`);

    const { data, error } = await supabase
      .from('shifts')
      .select('*')  // 全データを取得してデバッグ
      .eq('date', dateString);

    if (error) {
      console.error('シフト数取得エラー:', error);
      console.error('エラー詳細:', JSON.stringify(error, null, 2));
      return 0;
    }

    console.log(`  取得件数: ${data?.length || 0}件`);

    // アプリ側でdeletedをチェック
    const activeShifts = (data || []).filter((shift: any) => !shift.deleted);
    const count = activeShifts.length;
    console.log(`  論理削除を除いた件数: ${count}件`);
    console.log(`✅ ${dateString}のシフト数: ${count}件`);
    return count;
  } catch (error) {
    console.error('シフト数取得エラー:', error);
    return 0;
  }
};

// 日付ごとのシフトを削除（論理削除）
export const deleteShiftsByDate = async (year: number, month: number, day: number): Promise<number> => {
  try {
    const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    console.log(`🗑️ ${dateString}のシフトを削除中...`);

    // まず対象シフトを取得
    const { data: shifts, error: fetchError } = await supabase
      .from('shifts')
      .select('*')
      .eq('date', dateString);

    if (fetchError) {
      console.error('シフト取得エラー:', fetchError);
      throw fetchError;
    }

    if (!shifts || shifts.length === 0) {
      console.log('削除対象のシフトがありません');
      return 0;
    }

    // アプリ側でdeletedをチェックして、削除されていないもののみを対象にする
    const shiftsToDelete = shifts.filter((s: any) => !s.deleted);

    if (shiftsToDelete.length === 0) {
      console.log('削除対象のシフトがありません（全て削除済み）');
      return 0;
    }

    // 各シフトを論理削除
    const deletePromises = shiftsToDelete.map((shift: any) =>
      supabase
        .from('shifts')
        .update({
          deleted: true,
          deleted_at: new Date().toISOString()
        })
        .eq('id', shift.id)
    );

    await Promise.all(deletePromises);

    const deletedCount = shiftsToDelete.length;
    console.log(`✅ ${dateString}のシフトを削除しました（${deletedCount}件）`);
    return deletedCount;
  } catch (error) {
    console.error('シフト削除エラー:', error);
    throw error;
  }
};

// 月全体のシフト数を取得
export const getShiftsCountByMonth = async (year: number, month: number): Promise<number> => {
  try {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    console.log(`📊 Supabaseから${year}年${month}月全体のシフト数を確認中...`);
    console.log(`  期間: ${startDate} 〜 ${endDate}`);

    const { data, error } = await supabase
      .from('shifts')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate);

    if (error) {
      console.error('月全体のシフト数取得エラー:', error);
      console.error('エラー詳細:', JSON.stringify(error, null, 2));
      return 0;
    }

    console.log(`  取得件数: ${data?.length || 0}件`);

    // アプリ側でdeletedをチェック
    const activeShifts = (data || []).filter((shift: any) => !shift.deleted);
    const count = activeShifts.length;
    console.log(`  論理削除を除いた件数: ${count}件`);
    console.log(`✅ ${year}年${month}月のシフト数: ${count}件`);
    return count;
  } catch (error) {
    console.error('月全体のシフト数取得エラー:', error);
    return 0;
  }
};

// 月全体のシフトを削除（論理削除）
export const deleteShiftsByMonth = async (year: number, month: number): Promise<number> => {
  try {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    console.log(`🗑️ ${year}年${month}月全体のシフトを削除中...`);
    console.log(`  期間: ${startDate} 〜 ${endDate}`);

    // まず対象シフトを取得
    const { data: shifts, error: fetchError } = await supabase
      .from('shifts')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate);

    if (fetchError) {
      console.error('月全体のシフト取得エラー:', fetchError);
      throw fetchError;
    }

    if (!shifts || shifts.length === 0) {
      console.log('削除対象のシフトがありません');
      return 0;
    }

    // アプリ側でdeletedをチェックして、削除されていないもののみを対象にする
    const shiftsToDelete = shifts.filter((s: any) => !s.deleted);

    if (shiftsToDelete.length === 0) {
      console.log('削除対象のシフトがありません（全て削除済み）');
      return 0;
    }

    // 各シフトを論理削除
    const deletePromises = shiftsToDelete.map((shift: any) =>
      supabase
        .from('shifts')
        .update({
          deleted: true,
          deleted_at: new Date().toISOString()
        })
        .eq('id', shift.id)
    );

    await Promise.all(deletePromises);

    const deletedCount = shiftsToDelete.length;
    console.log(`✅ ${year}年${month}月のシフトを削除しました（${deletedCount}件）`);
    return deletedCount;
  } catch (error) {
    console.error('月全体のシフト削除エラー:', error);
    throw error;
  }
};

// Firebase互換のバックアップ関数（Supabaseの場合は同じ）
export const backupToFirebase = backupToSupabase;

// ========== 利用者（CareClient）関連 ==========

import type { CareClient, ShogaiSogoCity, ShogaiSogoCareCategory, ShogaiBurdenLimit, ShogaiBurdenLimitOffice, ShogaiServiceResponsible, ShogaiPlanConsultation, ShogaiCarePlan, ShogaiSameBuildingDeduction, ShogaiSupplyAmount, KaigoHihokenshaItem } from '../types';

// 利用者一覧を読み込み
export const loadCareClients = async (): Promise<CareClient[]> => {
  try {
    const { data, error } = await supabase
      .from('users_care')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      nameKana: row.name_kana || '',
      gender: row.gender || 'male',
      birthDate: row.birth_date || '',
      customerNumber: row.customer_number || '',
      abbreviation: row.abbreviation || '',
      postalCode: row.postal_code || '',
      address: row.address || '',
      phone: row.phone || '',
      mobilePhone: row.mobile_phone || '',
      contractStart: row.contract_start || '',
      contractEnd: row.contract_end || '',
      endReason: row.end_reason || '',
      emergencyContact: row.emergency_contact || '',
      emergencyContactName: row.emergency_contact_name || '',
      emergencyContactRelation: row.emergency_contact_relation || '',
      emergencyContactPhone: row.emergency_contact_phone || '',
      emergencyContact2Name: row.emergency_contact2_name || '',
      emergencyContact2Relation: row.emergency_contact2_relation || '',
      emergencyContact2Phone: row.emergency_contact2_phone || '',
      emergencyContact3Name: row.emergency_contact3_name || '',
      emergencyContact3Relation: row.emergency_contact3_relation || '',
      emergencyContact3Phone: row.emergency_contact3_phone || '',
      careLevel: row.care_level || '',
      area: row.area || '',
      childName: row.child_name || '',
      childNameKana: row.child_name_kana || '',
      childGender: row.child_gender || '',
      childBirthDate: row.child_birth_date || '',
      notes: row.notes || '',
      services: row.services || {},
      billing: row.billing || {},
      deleted: row.deleted || false,
      deletedAt: row.deleted_at || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (error) {
    console.error('利用者読み込みエラー:', error);
    throw error;
  }
};

// 利用者を保存（新規 & 更新）
export const saveCareClient = async (client: CareClient): Promise<void> => {
  try {
    const saveData = {
      id: client.id,
      name: client.name || '名前未設定',
      name_kana: client.nameKana || null,
      gender: client.gender || 'male',
      birth_date: client.birthDate || null,
      customer_number: client.customerNumber || null,
      abbreviation: client.abbreviation || null,
      postal_code: client.postalCode || null,
      address: client.address || null,
      phone: client.phone || null,
      mobile_phone: client.mobilePhone || null,
      contract_start: client.contractStart || null,
      contract_end: client.contractEnd || null,
      end_reason: client.endReason || null,
      emergency_contact: client.emergencyContact || null,
      emergency_contact_name: client.emergencyContactName || null,
      emergency_contact_relation: client.emergencyContactRelation || null,
      emergency_contact_phone: client.emergencyContactPhone || null,
      emergency_contact2_name: client.emergencyContact2Name || null,
      emergency_contact2_relation: client.emergencyContact2Relation || null,
      emergency_contact2_phone: client.emergencyContact2Phone || null,
      emergency_contact3_name: client.emergencyContact3Name || null,
      emergency_contact3_relation: client.emergencyContact3Relation || null,
      emergency_contact3_phone: client.emergencyContact3Phone || null,
      care_level: client.careLevel || null,
      area: client.area || null,
      child_name: client.childName || null,
      child_name_kana: client.childNameKana || null,
      child_gender: client.childGender || null,
      child_birth_date: client.childBirthDate || null,
      notes: client.notes || null,
      services: client.services || {},
      billing: client.billing || {},
      deleted: client.deleted || false,
      deleted_at: client.deletedAt || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('users_care')
      .upsert(saveData, { onConflict: 'id' });

    if (error) throw error;
    console.log('✅ 利用者を保存しました:', client.name);
  } catch (error) {
    console.error('利用者保存エラー:', error);
    throw error;
  }
};

// 利用者を論理削除
export const softDeleteCareClient = async (clientId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('users_care')
      .update({
        deleted: true,
        deleted_at: new Date().toISOString(),
      })
      .eq('id', clientId);

    if (error) throw error;
    console.log('✅ 利用者を論理削除しました:', clientId);
  } catch (error) {
    console.error('利用者削除エラー:', error);
    throw error;
  }
};

// 利用者を復元
export const restoreCareClient = async (clientId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('users_care')
      .update({
        deleted: false,
        deleted_at: null,
      })
      .eq('id', clientId);

    if (error) throw error;
    console.log('✅ 利用者を復元しました:', clientId);
  } catch (error) {
    console.error('利用者復元エラー:', error);
    throw error;
  }
};

// 利用者のリアルタイム監視
export const subscribeToCareClients = (callback: (clients: CareClient[] | null) => void) => {
  // 初回読み込み
  loadCareClients().then(clients => {
    callback(clients);
  }).catch(error => {
    console.error('利用者初回読み込みエラー:', error);
    callback(null);
  });

  // リアルタイム購読
  const channel = supabase
    .channel('users_care_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'users_care' },
      () => {
        loadCareClients().then(clients => {
          callback(clients);
        }).catch(error => {
          console.error('利用者リアルタイム更新エラー:', error);
        });
      }
    )
    .subscribe();

  return channel;
};

// ========== 障害者総合支援 - 支給市町村 ==========

export const loadShogaiSogoCities = async (careClientId: string, source: string = 'shogai'): Promise<ShogaiSogoCity[]> => {
  try {
    const { data, error } = await supabase
      .from('shogai_sogo_cities')
      .select('*')
      .eq('care_client_id', careClientId)
      .eq('source', source)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      careClientId: row.care_client_id,
      municipality: row.municipality || '',
      certificateNumber: row.certificate_number || '',
      validFrom: row.valid_from || '',
      validUntil: row.valid_until || '',
      sortOrder: row.sort_order || 0,
    }));
  } catch (error) {
    console.error('支給市町村読み込みエラー:', error);
    throw error;
  }
};

export const saveShogaiSogoCity = async (city: ShogaiSogoCity, source: string = 'shogai'): Promise<ShogaiSogoCity> => {
  try {
    const saveData: any = {
      care_client_id: city.careClientId,
      municipality: city.municipality || null,
      certificate_number: city.certificateNumber || null,
      valid_from: city.validFrom || null,
      valid_until: city.validUntil || null,
      sort_order: city.sortOrder || 0,
      source,
      updated_at: new Date().toISOString(),
    };
    if (city.id) {
      saveData.id = city.id;
    }

    const { data, error } = await supabase
      .from('shogai_sogo_cities')
      .upsert(saveData, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      careClientId: data.care_client_id,
      municipality: data.municipality || '',
      certificateNumber: data.certificate_number || '',
      validFrom: data.valid_from || '',
      validUntil: data.valid_until || '',
      sortOrder: data.sort_order || 0,
    };
  } catch (error) {
    console.error('支給市町村保存エラー:', error);
    throw error;
  }
};

export const deleteShogaiSogoCity = async (cityId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('shogai_sogo_cities')
      .delete()
      .eq('id', cityId);

    if (error) throw error;
  } catch (error) {
    console.error('支給市町村削除エラー:', error);
    throw error;
  }
};

// ========== 障害者総合支援 - 障害支援区分 ==========

export const loadShogaiSogoCareCategories = async (careClientId: string, source: string = 'shogai'): Promise<ShogaiSogoCareCategory[]> => {
  try {
    const { data, error } = await supabase
      .from('shogai_sogo_care_categories')
      .select('*')
      .eq('care_client_id', careClientId)
      .eq('source', source)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      careClientId: row.care_client_id,
      disabilityType: row.disability_type || '',
      supportCategory: row.support_category || '',
      certificationDate: row.certification_date || '',
      validFrom: row.valid_from || '',
      validUntil: row.valid_until || '',
      sortOrder: row.sort_order || 0,
    }));
  } catch (error) {
    console.error('障害支援区分読み込みエラー:', error);
    throw error;
  }
};

export const saveShogaiSogoCareCategory = async (category: ShogaiSogoCareCategory, source: string = 'shogai'): Promise<ShogaiSogoCareCategory> => {
  try {
    const saveData: any = {
      care_client_id: category.careClientId,
      disability_type: category.disabilityType || null,
      support_category: category.supportCategory || null,
      certification_date: category.certificationDate || null,
      valid_from: category.validFrom || null,
      valid_until: category.validUntil || null,
      sort_order: category.sortOrder || 0,
      source,
      updated_at: new Date().toISOString(),
    };
    if (category.id) {
      saveData.id = category.id;
    }

    const { data, error } = await supabase
      .from('shogai_sogo_care_categories')
      .upsert(saveData, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      careClientId: data.care_client_id,
      disabilityType: data.disability_type || '',
      supportCategory: data.support_category || '',
      certificationDate: data.certification_date || '',
      validFrom: data.valid_from || '',
      validUntil: data.valid_until || '',
      sortOrder: data.sort_order || 0,
    };
  } catch (error) {
    console.error('障害支援区分保存エラー:', error);
    throw error;
  }
};

export const deleteShogaiSogoCareCategory = async (categoryId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('shogai_sogo_care_categories')
      .delete()
      .eq('id', categoryId);

    if (error) throw error;
  } catch (error) {
    console.error('障害支援区分削除エラー:', error);
    throw error;
  }
};

// ========== 障害者総合支援 - 利用者負担上限月額 ==========

export const loadShogaiBurdenLimits = async (careClientId: string, source: string = 'shogai'): Promise<ShogaiBurdenLimit[]> => {
  try {
    const { data, error } = await supabase
      .from('shogai_burden_limits')
      .select('*')
      .eq('care_client_id', careClientId)
      .eq('source', source)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      careClientId: row.care_client_id,
      burdenLimitMonthly: row.burden_limit_monthly || '',
      validFrom: row.valid_from || '',
      validUntil: row.valid_until || '',
      sortOrder: row.sort_order || 0,
    }));
  } catch (error) {
    console.error('利用者負担上限月額読み込みエラー:', error);
    throw error;
  }
};

export const saveShogaiBurdenLimit = async (item: ShogaiBurdenLimit, source: string = 'shogai'): Promise<ShogaiBurdenLimit> => {
  try {
    const saveData: any = {
      care_client_id: item.careClientId,
      burden_limit_monthly: item.burdenLimitMonthly || null,
      valid_from: item.validFrom || null,
      valid_until: item.validUntil || null,
      sort_order: item.sortOrder || 0,
      source,
      updated_at: new Date().toISOString(),
    };
    if (item.id) saveData.id = item.id;

    const { data, error } = await supabase
      .from('shogai_burden_limits')
      .upsert(saveData, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      careClientId: data.care_client_id,
      burdenLimitMonthly: data.burden_limit_monthly || '',
      validFrom: data.valid_from || '',
      validUntil: data.valid_until || '',
      sortOrder: data.sort_order || 0,
    };
  } catch (error) {
    console.error('利用者負担上限月額保存エラー:', error);
    throw error;
  }
};

export const deleteShogaiBurdenLimit = async (id: string): Promise<void> => {
  try {
    const { error } = await supabase.from('shogai_burden_limits').delete().eq('id', id);
    if (error) throw error;
  } catch (error) {
    console.error('利用者負担上限月額削除エラー:', error);
    throw error;
  }
};

// ========== 障害者総合支援 - 利用者負担上限額管理事業所 ==========

export const loadShogaiBurdenLimitOffices = async (careClientId: string, source: string = 'shogai'): Promise<ShogaiBurdenLimitOffice[]> => {
  try {
    const { data, error } = await supabase
      .from('shogai_burden_limit_offices')
      .select('*')
      .eq('care_client_id', careClientId)
      .eq('source', source)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      careClientId: row.care_client_id,
      officeName: row.office_name || '',
      validFrom: row.valid_from || '',
      validUntil: row.valid_until || '',
      sortOrder: row.sort_order || 0,
    }));
  } catch (error) {
    console.error('利用者負担上限額管理事業所読み込みエラー:', error);
    throw error;
  }
};

export const saveShogaiBurdenLimitOffice = async (item: ShogaiBurdenLimitOffice, source: string = 'shogai'): Promise<ShogaiBurdenLimitOffice> => {
  try {
    const saveData: any = {
      care_client_id: item.careClientId,
      office_name: item.officeName || null,
      source,
      valid_from: item.validFrom || null,
      valid_until: item.validUntil || null,
      sort_order: item.sortOrder || 0,
      updated_at: new Date().toISOString(),
    };
    if (item.id) saveData.id = item.id;

    const { data, error } = await supabase
      .from('shogai_burden_limit_offices')
      .upsert(saveData, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      careClientId: data.care_client_id,
      officeName: data.office_name || '',
      validFrom: data.valid_from || '',
      validUntil: data.valid_until || '',
      sortOrder: data.sort_order || 0,
    };
  } catch (error) {
    console.error('利用者負担上限額管理事業所保存エラー:', error);
    throw error;
  }
};

export const deleteShogaiBurdenLimitOffice = async (id: string): Promise<void> => {
  try {
    const { error } = await supabase.from('shogai_burden_limit_offices').delete().eq('id', id);
    if (error) throw error;
  } catch (error) {
    console.error('利用者負担上限額管理事業所削除エラー:', error);
    throw error;
  }
};

// ========== 障害者総合支援 - サービス提供責任者 ==========

export const loadShogaiServiceResponsibles = async (careClientId: string, source: string = 'shogai'): Promise<ShogaiServiceResponsible[]> => {
  try {
    const { data, error } = await supabase
      .from('shogai_service_responsibles')
      .select('*')
      .eq('care_client_id', careClientId)
      .eq('source', source)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      careClientId: row.care_client_id,
      helperId: row.helper_id || '',
      helperName: row.helper_name || '',
      validFrom: row.valid_from || '',
      validUntil: row.valid_until || '',
      sortOrder: row.sort_order || 0,
    }));
  } catch (error) {
    console.error('サービス提供責任者読み込みエラー:', error);
    throw error;
  }
};

export const saveShogaiServiceResponsible = async (item: ShogaiServiceResponsible, source: string = 'shogai'): Promise<ShogaiServiceResponsible> => {
  try {
    const saveData: any = {
      care_client_id: item.careClientId,
      helper_id: item.helperId || null,
      helper_name: item.helperName || null,
      valid_from: item.validFrom || null,
      valid_until: item.validUntil || null,
      sort_order: item.sortOrder || 0,
      source,
      updated_at: new Date().toISOString(),
    };
    if (item.id) saveData.id = item.id;

    const { data, error } = await supabase
      .from('shogai_service_responsibles')
      .upsert(saveData, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      careClientId: data.care_client_id,
      helperId: data.helper_id || '',
      helperName: data.helper_name || '',
      validFrom: data.valid_from || '',
      validUntil: data.valid_until || '',
      sortOrder: data.sort_order || 0,
    };
  } catch (error) {
    console.error('サービス提供責任者保存エラー:', error);
    throw error;
  }
};

export const deleteShogaiServiceResponsible = async (id: string): Promise<void> => {
  try {
    const { error } = await supabase.from('shogai_service_responsibles').delete().eq('id', id);
    if (error) throw error;
  } catch (error) {
    console.error('サービス提供責任者削除エラー:', error);
    throw error;
  }
};

// ========== 障害者総合支援 - 計画相談支援 ==========

export const loadShogaiPlanConsultations = async (careClientId: string): Promise<ShogaiPlanConsultation[]> => {
  try {
    const { data, error } = await supabase
      .from('shogai_plan_consultations')
      .select('*')
      .eq('care_client_id', careClientId)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      careClientId: row.care_client_id,
      consultationOffice: row.consultation_office || '',
      consultationSpecialist: row.consultation_specialist || '',
      validFrom: row.valid_from || '',
      validUntil: row.valid_until || '',
      sortOrder: row.sort_order || 0,
    }));
  } catch (error) {
    console.error('計画相談支援読み込みエラー:', error);
    throw error;
  }
};

export const saveShogaiPlanConsultation = async (item: ShogaiPlanConsultation): Promise<ShogaiPlanConsultation> => {
  try {
    const saveData: any = {
      care_client_id: item.careClientId,
      consultation_office: item.consultationOffice || null,
      consultation_specialist: item.consultationSpecialist || null,
      valid_from: item.validFrom || null,
      valid_until: item.validUntil || null,
      sort_order: item.sortOrder || 0,
      updated_at: new Date().toISOString(),
    };
    if (item.id) saveData.id = item.id;

    const { data, error } = await supabase
      .from('shogai_plan_consultations')
      .upsert(saveData, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      careClientId: data.care_client_id,
      consultationOffice: data.consultation_office || '',
      consultationSpecialist: data.consultation_specialist || '',
      validFrom: data.valid_from || '',
      validUntil: data.valid_until || '',
      sortOrder: data.sort_order || 0,
    };
  } catch (error) {
    console.error('計画相談支援保存エラー:', error);
    throw error;
  }
};

export const deleteShogaiPlanConsultation = async (id: string): Promise<void> => {
  try {
    const { error } = await supabase.from('shogai_plan_consultations').delete().eq('id', id);
    if (error) throw error;
  } catch (error) {
    console.error('計画相談支援削除エラー:', error);
    throw error;
  }
};

// ========== 障害者総合支援 - 初任者介護計画/支援計画 ==========

export const loadShogaiCarePlans = async (careClientId: string, planType?: string): Promise<ShogaiCarePlan[]> => {
  try {
    let query = supabase
      .from('shogai_care_plans')
      .select('*')
      .eq('care_client_id', careClientId);

    if (planType) {
      query = query.eq('plan_type', planType);
    }

    const { data, error } = await query.order('sort_order', { ascending: true });

    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      careClientId: row.care_client_id,
      planType: row.plan_type || 'initial_care',
      officeName: row.office_name || '',
      validFrom: row.valid_from || '',
      validUntil: row.valid_until || '',
      sortOrder: row.sort_order || 0,
    }));
  } catch (error) {
    console.error('介護計画読み込みエラー:', error);
    throw error;
  }
};

export const saveShogaiCarePlan = async (item: ShogaiCarePlan): Promise<ShogaiCarePlan> => {
  try {
    const saveData: any = {
      care_client_id: item.careClientId,
      plan_type: item.planType || 'initial_care',
      office_name: item.officeName || null,
      valid_from: item.validFrom || null,
      valid_until: item.validUntil || null,
      sort_order: item.sortOrder || 0,
      updated_at: new Date().toISOString(),
    };
    if (item.id) saveData.id = item.id;

    const { data, error } = await supabase
      .from('shogai_care_plans')
      .upsert(saveData, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      careClientId: data.care_client_id,
      planType: data.plan_type || 'initial_care',
      officeName: data.office_name || '',
      validFrom: data.valid_from || '',
      validUntil: data.valid_until || '',
      sortOrder: data.sort_order || 0,
    };
  } catch (error) {
    console.error('介護計画保存エラー:', error);
    throw error;
  }
};

export const deleteShogaiCarePlan = async (id: string): Promise<void> => {
  try {
    const { error } = await supabase.from('shogai_care_plans').delete().eq('id', id);
    if (error) throw error;
  } catch (error) {
    console.error('介護計画削除エラー:', error);
    throw error;
  }
};

// ========== 障害者総合支援 - 同一建物減算 ==========

export const loadShogaiSameBuildingDeductions = async (careClientId: string, source: string = 'shogai'): Promise<ShogaiSameBuildingDeduction[]> => {
  try {
    const { data, error } = await supabase
      .from('shogai_same_building_deductions')
      .select('*')
      .eq('care_client_id', careClientId)
      .eq('source', source)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      careClientId: row.care_client_id,
      officeName: row.office_name || '',
      deductionCategory: row.deduction_category || '',
      validFrom: row.valid_from || '',
      validUntil: row.valid_until || '',
      sortOrder: row.sort_order || 0,
    }));
  } catch (error) {
    console.error('同一建物減算読み込みエラー:', error);
    throw error;
  }
};

export const saveShogaiSameBuildingDeduction = async (item: ShogaiSameBuildingDeduction, source: string = 'shogai'): Promise<ShogaiSameBuildingDeduction> => {
  try {
    const saveData: any = {
      care_client_id: item.careClientId,
      office_name: item.officeName || null,
      deduction_category: item.deductionCategory || null,
      valid_from: item.validFrom || null,
      valid_until: item.validUntil || null,
      sort_order: item.sortOrder || 0,
      source,
      updated_at: new Date().toISOString(),
    };
    if (item.id) saveData.id = item.id;

    const { data, error } = await supabase
      .from('shogai_same_building_deductions')
      .upsert(saveData, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      careClientId: data.care_client_id,
      officeName: data.office_name || '',
      deductionCategory: data.deduction_category || '',
      validFrom: data.valid_from || '',
      validUntil: data.valid_until || '',
      sortOrder: data.sort_order || 0,
    };
  } catch (error) {
    console.error('同一建物減算保存エラー:', error);
    throw error;
  }
};

export const deleteShogaiSameBuildingDeduction = async (id: string): Promise<void> => {
  try {
    const { error } = await supabase.from('shogai_same_building_deductions').delete().eq('id', id);
    if (error) throw error;
  } catch (error) {
    console.error('同一建物減算削除エラー:', error);
    throw error;
  }
};

// ========== 障害者総合支援 - 契約支給量/決定支給量 ==========

export const loadShogaiSupplyAmounts = async (careClientId: string, supplyType?: string, source: string = 'shogai'): Promise<ShogaiSupplyAmount[]> => {
  try {
    let query = supabase
      .from('shogai_supply_amounts')
      .select('*')
      .eq('care_client_id', careClientId)
      .eq('source', source);

    if (supplyType) {
      query = query.eq('supply_type', supplyType);
    }

    const { data, error } = await query.order('sort_order', { ascending: true });

    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      careClientId: row.care_client_id,
      supplyType: row.supply_type || 'contract',
      serviceCategory: row.service_category || '',
      serviceContent: row.service_content || '',
      officeEntryNumber: row.office_entry_number || '',
      officeName: row.office_name || '',
      supplyAmount: row.supply_amount || '',
      maxSingleAmount: row.max_single_amount || '',
      validFrom: row.valid_from || '',
      validUntil: row.valid_until || '',
      sortOrder: row.sort_order || 0,
    }));
  } catch (error) {
    console.error('支給量読み込みエラー:', error);
    throw error;
  }
};

export const saveShogaiSupplyAmount = async (item: ShogaiSupplyAmount, source: string = 'shogai'): Promise<ShogaiSupplyAmount> => {
  try {
    const saveData: any = {
      care_client_id: item.careClientId,
      supply_type: item.supplyType || 'contract',
      service_category: item.serviceCategory || null,
      service_content: item.serviceContent || null,
      office_entry_number: item.officeEntryNumber || null,
      office_name: item.officeName || null,
      supply_amount: item.supplyAmount || null,
      max_single_amount: item.maxSingleAmount || null,
      valid_from: item.validFrom || null,
      valid_until: item.validUntil || null,
      sort_order: item.sortOrder || 0,
      source,
      updated_at: new Date().toISOString(),
    };
    if (item.id) saveData.id = item.id;

    const { data, error } = await supabase
      .from('shogai_supply_amounts')
      .upsert(saveData, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      careClientId: data.care_client_id,
      supplyType: data.supply_type || 'contract',
      serviceCategory: data.service_category || '',
      serviceContent: data.service_content || '',
      officeEntryNumber: data.office_entry_number || '',
      officeName: data.office_name || '',
      supplyAmount: data.supply_amount || '',
      maxSingleAmount: data.max_single_amount || '',
      validFrom: data.valid_from || '',
      validUntil: data.valid_until || '',
      sortOrder: data.sort_order || 0,
    };
  } catch (error) {
    console.error('支給量保存エラー:', error);
    throw error;
  }
};

export const deleteShogaiSupplyAmount = async (id: string): Promise<void> => {
  try {
    const { error } = await supabase.from('shogai_supply_amounts').delete().eq('id', id);
    if (error) throw error;
  } catch (error) {
    console.error('支給量削除エラー:', error);
    throw error;
  }
};

// ========== 障害者総合支援 - 居宅介護計画書ドキュメント ==========

export const loadShogaiCarePlanDocuments = async (careClientId: string, planCategory?: string): Promise<any[]> => {
  try {
    let query = supabase
      .from('shogai_care_plan_documents')
      .select('*')
      .eq('care_client_id', careClientId);
    if (planCategory) {
      query = query.eq('plan_category', planCategory);
    }
    const { data, error } = await query.order('sort_order');
    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      careClientId: row.care_client_id,
      planCategory: row.plan_category,
      fileName: row.file_name || '',
      fileUrl: row.file_url || '',
      fileSize: row.file_size || 0,
      notes: row.notes || '',
      sortOrder: row.sort_order || 0,
      createdAt: row.created_at || '',
    }));
  } catch (error) {
    console.error('介護計画書ドキュメント読み込みエラー:', error);
    throw error;
  }
};

export const saveShogaiCarePlanDocument = async (item: any): Promise<any> => {
  try {
    const saveData: any = {
      care_client_id: item.careClientId,
      plan_category: item.planCategory,
      file_name: item.fileName || null,
      file_url: item.fileUrl || null,
      file_size: item.fileSize || null,
      notes: item.notes || null,
      sort_order: item.sortOrder || 0,
      updated_at: new Date().toISOString(),
    };
    if (item.id) {
      saveData.id = item.id;
    }
    const { data, error } = await supabase
      .from('shogai_care_plan_documents')
      .upsert(saveData, { onConflict: 'id' })
      .select()
      .single();
    if (error) throw error;
    return {
      id: data.id,
      careClientId: data.care_client_id,
      planCategory: data.plan_category,
      fileName: data.file_name || '',
      fileUrl: data.file_url || '',
      fileSize: data.file_size || 0,
      notes: data.notes || '',
      sortOrder: data.sort_order || 0,
      createdAt: data.created_at || '',
    };
  } catch (error) {
    console.error('介護計画書ドキュメント保存エラー:', error);
    throw error;
  }
};

export const deleteShogaiCarePlanDocument = async (id: string): Promise<void> => {
  try {
    const { error } = await supabase.from('shogai_care_plan_documents').delete().eq('id', id);
    if (error) throw error;
  } catch (error) {
    console.error('介護計画書ドキュメント削除エラー:', error);
    throw error;
  }
};

export const uploadCarePlanFile = async (careClientId: string, planCategory: string, file: File): Promise<{ url: string; path: string }> => {
  const ext = file.name.split('.').pop() || 'bin';
  const filePath = `${careClientId}/${planCategory}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from('care-plan-documents')
    .upload(filePath, file);
  if (error) throw error;
  const { data } = supabase.storage
    .from('care-plan-documents')
    .getPublicUrl(filePath);
  return { url: data.publicUrl, path: filePath };
};

export const deleteCarePlanFile = async (filePath: string): Promise<void> => {
  const { error } = await supabase.storage
    .from('care-plan-documents')
    .remove([filePath]);
  if (error) throw error;
};

// ========== 障害者総合支援 - 汎用ドキュメント ==========

export const loadShogaiDocuments = async (careClientId: string, docType: string): Promise<any[]> => {
  try {
    const { data, error } = await supabase
      .from('shogai_documents')
      .select('*')
      .eq('care_client_id', careClientId)
      .eq('doc_type', docType)
      .order('sort_order');
    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      careClientId: row.care_client_id,
      docType: row.doc_type,
      fileName: row.file_name || '',
      fileUrl: row.file_url || '',
      fileSize: row.file_size || 0,
      notes: row.notes || '',
      sortOrder: row.sort_order || 0,
      createdAt: row.created_at || '',
    }));
  } catch (error) {
    console.error('障害ドキュメント読み込みエラー:', error);
    throw error;
  }
};

export const saveShogaiDocument = async (item: any): Promise<any> => {
  try {
    const saveData: any = {
      care_client_id: item.careClientId,
      doc_type: item.docType,
      file_name: item.fileName || null,
      file_url: item.fileUrl || null,
      file_size: item.fileSize || null,
      notes: item.notes || null,
      sort_order: item.sortOrder || 0,
      updated_at: new Date().toISOString(),
    };
    if (item.id) {
      saveData.id = item.id;
    }
    const { data, error } = await supabase
      .from('shogai_documents')
      .upsert(saveData, { onConflict: 'id' })
      .select()
      .single();
    if (error) throw error;
    return {
      id: data.id,
      careClientId: data.care_client_id,
      docType: data.doc_type,
      fileName: data.file_name || '',
      fileUrl: data.file_url || '',
      fileSize: data.file_size || 0,
      notes: data.notes || '',
      sortOrder: data.sort_order || 0,
      createdAt: data.created_at || '',
    };
  } catch (error) {
    console.error('障害ドキュメント保存エラー:', error);
    throw error;
  }
};

export const deleteShogaiDocument = async (id: string): Promise<void> => {
  try {
    const { error } = await supabase.from('shogai_documents').delete().eq('id', id);
    if (error) throw error;
  } catch (error) {
    console.error('障害ドキュメント削除エラー:', error);
    throw error;
  }
};

export const uploadShogaiDocFile = async (careClientId: string, docType: string, file: File): Promise<{ url: string; path: string }> => {
  const ext = file.name.split('.').pop() || 'bin';
  const filePath = `${careClientId}/${docType}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from('shogai-documents')
    .upload(filePath, file);
  if (error) throw error;
  const { data } = supabase.storage
    .from('shogai-documents')
    .getPublicUrl(filePath);
  return { url: data.publicUrl, path: filePath };
};

// ========== 障害者総合支援 - 利用サービス ==========

export const loadShogaiUsedServices = async (careClientId: string, source: string = 'shogai'): Promise<import('../types').ShogaiUsedService[]> => {
  try {
    const { data, error } = await supabase
      .from('shogai_used_services')
      .select('*')
      .eq('care_client_id', careClientId)
      .eq('source', source)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      careClientId: row.care_client_id,
      serviceType: row.service_type || '',
      serviceStartDate: row.service_start_date || '',
      serviceEndDate: row.service_end_date || '',
      sortOrder: row.sort_order || 0,
    }));
  } catch (error) {
    console.error('利用サービス読み込みエラー:', error);
    throw error;
  }
};

export const saveShogaiUsedService = async (item: import('../types').ShogaiUsedService, source: string = 'shogai'): Promise<import('../types').ShogaiUsedService> => {
  try {
    const saveData: any = {
      care_client_id: item.careClientId,
      service_type: item.serviceType || null,
      service_start_date: item.serviceStartDate || null,
      service_end_date: item.serviceEndDate || null,
      sort_order: item.sortOrder || 0,
      source,
      updated_at: new Date().toISOString(),
    };
    if (item.id) saveData.id = item.id;

    const { data, error } = await supabase
      .from('shogai_used_services')
      .upsert(saveData, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      careClientId: data.care_client_id,
      serviceType: data.service_type || '',
      serviceStartDate: data.service_start_date || '',
      serviceEndDate: data.service_end_date || '',
      sortOrder: data.sort_order || 0,
    };
  } catch (error) {
    console.error('利用サービス保存エラー:', error);
    throw error;
  }
};

export const deleteShogaiUsedService = async (id: string): Promise<void> => {
  try {
    const { error } = await supabase.from('shogai_used_services').delete().eq('id', id);
    if (error) throw error;
  } catch (error) {
    console.error('利用サービス削除エラー:', error);
    throw error;
  }
};

// ========== 介護保険 - 被保険者証 汎用項目 ==========

export const loadKaigoHihokenshaItems = async (careClientId: string, category: string): Promise<KaigoHihokenshaItem[]> => {
  try {
    const { data, error } = await supabase
      .from('kaigo_hihokensha_items')
      .select('*')
      .eq('care_client_id', careClientId)
      .eq('category', category)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      careClientId: row.care_client_id,
      category: row.category,
      value1: row.value1 || '',
      value2: row.value2 || '',
      value3: row.value3 || '',
      value4: row.value4 || '',
      value5: row.value5 || '',
      validFrom: row.valid_from || '',
      validUntil: row.valid_until || '',
      sortOrder: row.sort_order || 0,
    }));
  } catch (error) {
    console.error('介護被保険者証項目読み込みエラー:', error);
    throw error;
  }
};

export const saveKaigoHihokenshaItem = async (item: KaigoHihokenshaItem): Promise<KaigoHihokenshaItem> => {
  try {
    const saveData: any = {
      care_client_id: item.careClientId,
      category: item.category,
      value1: item.value1 || null,
      value2: item.value2 || null,
      value3: item.value3 || null,
      value4: item.value4 || null,
      value5: item.value5 || null,
      valid_from: item.validFrom || null,
      valid_until: item.validUntil || null,
      sort_order: item.sortOrder || 0,
      updated_at: new Date().toISOString(),
    };
    if (item.id) saveData.id = item.id;

    const { data, error } = await supabase
      .from('kaigo_hihokensha_items')
      .upsert(saveData, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      careClientId: data.care_client_id,
      category: data.category,
      value1: data.value1 || '',
      value2: data.value2 || '',
      value3: data.value3 || '',
      value4: data.value4 || '',
      value5: data.value5 || '',
      validFrom: data.valid_from || '',
      validUntil: data.valid_until || '',
      sortOrder: data.sort_order || 0,
    };
  } catch (error) {
    console.error('介護被保険者証項目保存エラー:', error);
    throw error;
  }
};

export const deleteKaigoHihokenshaItem = async (id: string): Promise<void> => {
  try {
    const { error } = await supabase.from('kaigo_hihokensha_items').delete().eq('id', id);
    if (error) throw error;
  } catch (error) {
    console.error('介護被保険者証項目削除エラー:', error);
    throw error;
  }
};
