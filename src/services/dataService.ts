/**
 * データサービス統合レイヤー
 * 環境変数でFirebaseとSupabaseを切り替え可能
 */

// 環境変数でどちらを使うか決定
// Supabaseの設定が揃っている場合のみSupabaseモードを有効化
const HAS_SUPABASE_CONFIG = !!(
  import.meta.env.VITE_SUPABASE_URL &&
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const USE_SUPABASE =
  import.meta.env.VITE_USE_SUPABASE === 'true' &&
  HAS_SUPABASE_CONFIG;

// Firebaseサービス
import * as firestoreService from './firestoreService';

// Supabaseサービス
import * as supabaseService from './supabaseService';

// RealtimeChannelをunsubscribe関数に変換するラッパー
const wrapSubscription = (fn: any) => {
  return (...args: any[]) => {
    const result = fn(...args);
    // RealtimeChannelの場合、unsubscribe関数でラップ
    if (result && typeof result === 'object' && 'unsubscribe' in result) {
      return () => result.unsubscribe();
    }
    return result;
  };
};

// Supabaseの場合はsubscribe関数をラップ
const wrappedSupabaseService = USE_SUPABASE ? {
  ...supabaseService,
  subscribeToHelpers: wrapSubscription(supabaseService.subscribeToHelpers),
  subscribeToShiftsForMonth: wrapSubscription(supabaseService.subscribeToShiftsForMonth),
  subscribeToDayOffRequestsMap: wrapSubscription(supabaseService.subscribeToDayOffRequestsMap),
  subscribeToScheduledDayOffs: wrapSubscription(supabaseService.subscribeToScheduledDayOffs),
  subscribeToDisplayTextsMap: wrapSubscription(supabaseService.subscribeToDisplayTextsMap),
  subscribeToCareClients: wrapSubscription(supabaseService.subscribeToCareClients),
} : null;

// 使用するサービスを選択
const dataService = USE_SUPABASE ? wrappedSupabaseService! : firestoreService;

// エクスポート
export const {
  // ヘルパー関連
  saveHelpers,
  loadHelpers,
  softDeleteHelper,
  loadHelperByToken,
  subscribeToHelpers,

  // シフト関連
  saveShiftsForMonth,
  loadShiftsForMonth,
  deleteShift,
  softDeleteShift,
  saveShift,
  clearCancelStatus,
  restoreShift,
  moveShift,
  subscribeToShiftsForMonth,

  // 休み希望関連
  loadDayOffRequests,
  saveDayOffRequests,
  subscribeToDayOffRequestsMap,

  // 指定休関連
  loadScheduledDayOffs,
  saveScheduledDayOffs,
  subscribeToScheduledDayOffs,

  // 表示テキスト関連
  loadDisplayTexts,
  saveDisplayTexts,
  subscribeToDisplayTextsMap,

  // バックアップ関連
  backupToFirebase,

  // 利用者関連
  loadCareClients,
  saveCareClient,
  softDeleteCareClient,
  restoreCareClient,
  subscribeToCareClients,

  // 障害者総合支援 - 支給市町村
  loadShogaiSogoCities,
  saveShogaiSogoCity,
  deleteShogaiSogoCity,

  // 障害者総合支援 - 障害支援区分
  loadShogaiSogoCareCategories,
  saveShogaiSogoCareCategory,
  deleteShogaiSogoCareCategory,

  // 障害者総合支援 - 利用者負担上限月額
  loadShogaiBurdenLimits,
  saveShogaiBurdenLimit,
  deleteShogaiBurdenLimit,

  // 障害者総合支援 - 利用者負担上限額管理事業所
  loadShogaiBurdenLimitOffices,
  saveShogaiBurdenLimitOffice,
  deleteShogaiBurdenLimitOffice,

  // 障害者総合支援 - サービス提供責任者
  loadShogaiServiceResponsibles,
  saveShogaiServiceResponsible,
  deleteShogaiServiceResponsible,

  // 障害者総合支援 - 計画相談支援
  loadShogaiPlanConsultations,
  saveShogaiPlanConsultation,
  deleteShogaiPlanConsultation,

  // 障害者総合支援 - 初任者介護計画/支援計画
  loadShogaiCarePlans,
  saveShogaiCarePlan,
  deleteShogaiCarePlan,

  // 障害者総合支援 - 同一建物減算
  loadShogaiSameBuildingDeductions,
  saveShogaiSameBuildingDeduction,
  deleteShogaiSameBuildingDeduction,

  // 障害者総合支援 - 契約支給量/決定支給量
  loadShogaiSupplyAmounts,
  saveShogaiSupplyAmount,
  deleteShogaiSupplyAmount,

  // 障害者総合支援 - 居宅介護計画書ドキュメント
  loadShogaiCarePlanDocuments,
  saveShogaiCarePlanDocument,
  deleteShogaiCarePlanDocument,
  uploadCarePlanFile,
  deleteCarePlanFile,
  loadShogaiDocuments,
  saveShogaiDocument,
  deleteShogaiDocument,
  uploadShogaiDocFile,

  // 障害者総合支援 - 利用サービス
  loadShogaiUsedServices,
  saveShogaiUsedService,
  deleteShogaiUsedService,

  // 介護保険 - 被保険者証 汎用項目
  loadKaigoHihokenshaItems,
  saveKaigoHihokenshaItem,
  deleteKaigoHihokenshaItem,

  // 請求確定実績
  saveBillingRecords,
  loadBillingRecordsForMonth,
  deleteBillingRecordsByBatch,
} = dataService;

// AIプロンプト関連（Supabase専用）
export const loadAiPrompt = supabaseService.loadAiPrompt;
export const saveAiPrompt = supabaseService.saveAiPrompt;
export type { AiPrompt } from './supabaseService';

// 日付ごとのシフト削除機能を追加
export const deleteShiftsByDate = async (year: number, month: number, day: number): Promise<number> => {
  const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  if (USE_SUPABASE) {
    // Supabaseの場合
    return supabaseService.deleteShiftsByDate(year, month, day);
  } else {
    // Firebaseの場合
    return firestoreService.deleteShiftsByDate(year, month, day);
  }
};

// 日付ごとのシフト数を取得
export const getShiftsCountByDate = async (year: number, month: number, day: number): Promise<number> => {
  const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  console.log(`[dataService] データベースタイプ: ${getDataServiceType()}`);
  console.log(`[dataService] 日付: ${dateString}のシフト数を取得`);

  if (USE_SUPABASE) {
    // Supabaseの場合
    console.log('[dataService] → Supabaseサービスを使用');
    return supabaseService.getShiftsCountByDate(year, month, day);
  } else {
    // Firebaseの場合
    console.log('[dataService] → Firebaseサービスを使用');
    return firestoreService.getShiftsCountByDate(year, month, day);
  }
};

// 月全体のシフト数を取得
export const getShiftsCountByMonth = async (year: number, month: number): Promise<number> => {
  console.log(`[dataService] データベースタイプ: ${getDataServiceType()}`);
  console.log(`[dataService] ${year}年${month}月全体のシフト数を取得`);

  if (USE_SUPABASE) {
    // Supabaseの場合
    console.log('[dataService] → Supabaseサービスを使用');
    return supabaseService.getShiftsCountByMonth(year, month);
  } else {
    // Firebaseの場合
    console.log('[dataService] → Firebaseサービスを使用');
    return firestoreService.getShiftsCountByMonth(year, month);
  }
};

// 月全体のシフトを削除
export const deleteShiftsByMonth = async (year: number, month: number): Promise<number> => {
  console.log(`[dataService] ${year}年${month}月全体のシフトを削除`);

  if (USE_SUPABASE) {
    // Supabaseの場合
    return supabaseService.deleteShiftsByMonth(year, month);
  } else {
    // Firebaseの場合
    return firestoreService.deleteShiftsByMonth(year, month);
  }
};

// Supabase特有のバックアップ関数
export const backupToSupabase = USE_SUPABASE
  ? supabaseService.backupToSupabase
  : supabaseService.backupToSupabase; // FirebaseでもSupabaseに保存できるように

// どちらのサービスを使用しているか確認
export const getDataServiceType = () => USE_SUPABASE ? 'Supabase' : 'Firebase';

// 初期化時にログ出力
if (typeof window !== 'undefined') {
  console.log(`📦 データサービス: ${getDataServiceType()}`);
  if (USE_SUPABASE) {
    console.log('✅ Supabaseモードで動作中');
  } else {
    console.log('🔥 Firebaseモードで動作中');

    // Supabaseが要求されたが設定がない場合の警告
    if (import.meta.env.VITE_USE_SUPABASE === 'true' && !HAS_SUPABASE_CONFIG) {
      console.warn('⚠️ Supabase環境変数が不足しています。Firebaseモードで動作します。');
    }
  }
}