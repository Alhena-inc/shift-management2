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
} = dataService;

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