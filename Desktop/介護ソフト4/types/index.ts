/**
 * 利用者（ユーザー）の型定義
 */
export interface User {
  顧客番号: string;
  苗字: string;
  名前: string;
  フリガナ苗字: string;
  フリガナ名前: string;
  性別: '男性' | '女性';
  生年月日: string;
  郵便番号: string;
  住所: string;
  緯度?: number;
  経度?: number;
  電話番号: string;
  携帯番号: string;
  グループ: string;
  契約開始日: string;
  契約終了日?: string;
  終了理由?: string;
  ステータス: 'active' | 'inactive' | 'suspended';
  略称?: string;
  備考?: string;
  児童苗字?: string;
  児童名前?: string;
  児童フリガナ苗字?: string;
  児童フリガナ名前?: string;
  児童性別?: '男性' | '女性';
  児童生年月日?: string;
}

/**
 * 事業所管理の型定義
 */
export interface OfficeManagement {
  顧客番号: string;
  契約日: string;
  利用者TEL: string;
  記入日付: string;
  記入担当者: string;
  相談支援事業所: string;
  担当者名: string;
  相談支援TEL: string;
  ステータス: '契約中' | '休止' | '終了';
  買込収益: number;
  ツナグ紹介料: number;
  週間スケジュール: {
    月: [string, string, string];
    火: [string, string, string];
    水: [string, string, string];
    木: [string, string, string];
    金: [string, string, string];
    土: [string, string, string];
    日: [string, string, string];
  };
  ケア時間週: number;
  ケア時間月: number;
  希望性別: '男' | '女' | '両';
  利用者性別: '男性' | '女性';
  対応ヘルパー: string[];
  地域: string;
  住所詳細: string;
  サービス種別: '居宅介護' | '重度訪問介護' | '移動支援' | '同行援護';
  ケア内容: string;
  障害内容: string;
  属付重要性: '高' | '中' | '低';
  属付重要詳細: string;
  開始希望時期: string;
  支給量: string;
  受給者証更新日: string;
  介入事業所数: number;
  同行有無: 'あり' | 'なし';
  同行回数: number[];
  詳細備考: string;
}

/**
 * 緊急連絡先の型定義
 */
export interface EmergencyContact {
  顧客番号: string;
  緊急連絡先1: {
    氏名: string;
    生年月日: string;
    郵便番号: string;
    住所: string;
    電話: string;
    携帯: string;
    続柄: string;
  };
  緊急連絡先2: {
    氏名: string;
    生年月日: string;
    郵便番号: string;
    住所: string;
    電話: string;
    携帯: string;
    続柄: string;
  };
  相談者: {
    氏名: string;
    生年月日: string;
    郵便番号: string;
    住所: string;
    電話: string;
    携帯: string;
  };
}

/**
 * 記録管理の型定義
 */
export type RecordType = '受給者証' | '個別支援計画' | 'アセスメント' | 'モニタリング' | 'マニュアル' | '事故ヒヤリハット';

export interface Record {
  記録ID: string;
  顧客番号: string;
  記録種別: RecordType;
  タイトル: string;
  作成日: string;
  作成者: string;
  期限日?: string;
  ファイルURL?: string;
  ステータス: '作成済' | '確認中' | '承認済' | '要更新';
  備考?: string;
}

/**
 * スケジュールの型定義
 */
export interface Schedule {
  日付: string;
  ヘルパーID: string;
  ヘルパー名: string;
  顧客番号: string;
  利用者名: string;
  サービス種別: '居宅介護' | '重度訪問介護' | '移動支援' | '同行援護';
  開始時刻: string;
  終了時刻: string;
  ケア内容: string;
  住所: string;
  ステータス: '予定' | '実施中' | '完了' | 'キャンセル';
}

/**
 * ヘルパーの型定義
 */
export interface Helper {
  ヘルパーID: string;
  氏名: string;
  フリガナ: string;
  生年月日: string;
  性別: '男性' | '女性';
  郵便番号: string;
  住所: string;
  電話番号: string;
  メールアドレス: string;
  資格: string[];
  雇用形態: '正社員' | '契約社員' | 'パート' | 'アルバイト';
  入社日: string;
  ステータス: 'active' | 'inactive' | 'suspended';
}

/**
 * アラートの型定義（ダッシュボード用）
 */
export interface Alert {
  id: string;
  利用者名: string;
  記録種別: RecordType;
  期限日: string;
  残日数: number;
  優先度: 'high' | 'medium' | 'low';
}

/**
 * 統計情報の型定義（ダッシュボード用）
 */
export interface Statistics {
  登録ヘルパー数: number;
  登録利用者数: number;
  本日の訪問件数: number;
  今月の総訪問時間: number;
}

/**
 * 郵便番号検索APIのレスポンス型
 */
export interface ZipCodeApiResponse {
  message: string | null;
  results: Array<{
    address1: string; // 都道府県
    address2: string; // 市区町村
    address3: string; // 町域
    kana1: string;
    kana2: string;
    kana3: string;
    prefcode: string;
    zipcode: string;
  }> | null;
  status: number;
}

/**
 * フォームのバリデーションスキーマ用の型
 */
export interface UserFormData extends Omit<User, '緯度' | '経度'> {
  緯度?: number;
  経度?: number;
}

export interface OfficeManagementFormData extends OfficeManagement {}

export interface EmergencyContactFormData extends EmergencyContact {}

export interface RecordFormData extends Omit<Record, '記録ID' | '作成日' | '作成者'> {}

export interface ScheduleFormData extends Omit<Schedule, 'ヘルパー名' | '利用者名'> {}

export interface HelperFormData extends Helper {}

/**
 * APIレスポンスの共通型
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * ページネーション情報
 */
export interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
}

/**
 * ソート情報
 */
export interface SortInfo {
  field: string;
  direction: 'asc' | 'desc';
}

/**
 * フィルター情報
 */
export interface FilterInfo {
  field: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'greaterThan' | 'lessThan';
  value: string | number | boolean;
}

/**
 * テーブル表示用のリクエスト型
 */
export interface TableRequest {
  pagination?: PaginationInfo;
  sort?: SortInfo;
  filters?: FilterInfo[];
  searchQuery?: string;
}

/**
 * テーブル表示用のレスポンス型
 */
export interface TableResponse<T> {
  items: T[];
  pagination: PaginationInfo;
}