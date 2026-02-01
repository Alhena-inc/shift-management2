# スプレッドシート → Firestore 同期機能

## 📋 概要

スプレッドシートのシフトデータをFirestoreに同期し、個人シフト画面でリアルタイム表示する機能です。

## 🔄 データフロー

```
┌─────────────────────────────┐
│ Googleスプレッドシート       │  ← ここで編集
│ (各ヘルパーのシート)          │
└──────────┬──────────────────┘
           │
           │ [メニュー: 🔄 Firestore同期]
           │ ボタンをクリック
           ↓
┌─────────────────────────────┐
│ Google Apps Script           │
│ sync-sheet-to-firestore.gs   │  ← 同期スクリプト
└──────────┬──────────────────┘
           │
           │ 各シートのデータを読み込み
           │ Shift型オブジェクトに変換
           ↓
┌─────────────────────────────┐
│ Firebase Firestore           │
│ shifts コレクション           │  ← データ保存
└──────────┬──────────────────┘
           │
           │ onSnapshot (リアルタイム監視)
           │ where('helperId', '==', ...)
           ↓
┌─────────────────────────────┐
│ 個人シフト画面                │
│ PersonalShift.tsx            │  ← 自動更新表示
└─────────────────────────────┘
```

## 📁 関連ファイル

### 1. スプレッドシート同期スクリプト
- **ファイル**: `/Users/koike/Desktop/シフト/sync-sheet-to-firestore.gs`
- **役割**: スプレッドシートのデータを読み取り、Firestoreに保存
- **実行方法**: スプレッドシートのメニュー「🔄 Firestore同期」→「📤 Firestoreに同期」

### 2. 個人シフト画面
- **ファイル**: `/Users/koike/Desktop/シフト/shift-table/src/components/PersonalShift.tsx`
- **役割**: Firestoreからシフトデータを取得し、週次カレンダー表示
- **更新**: リアルタイム（onSnapshot使用）

### 3. 設定ドキュメント
- **ファイル**: `/Users/koike/Desktop/シフト/SETUP_FIRESTORE_SYNC.md`
- **内容**: 同期機能の詳細な設定手順

## 🚀 セットアップ手順（概要）

詳細は `SETUP_FIRESTORE_SYNC.md` を参照してください。

### ステップ1: Firebase サービスアカウントの取得
1. Firebase Console でサービスアカウントキーを生成
2. JSONファイルから `client_email`, `private_key`, `project_id` を取得

### ステップ2: Apps Script ライブラリの追加
1. スプレッドシートで Apps Script エディタを開く
2. FirestoreApp ライブラリを追加
   - ライブラリID: `1VUSl4b1r1eoNcRWotZM3e87ygkxvXltOgyDZhixqncz9lQ3MjfT1iKFw`

### ステップ3: 同期スクリプトの設定
1. `sync-sheet-to-firestore.gs` をコピー
2. FIREBASE_CONFIG を更新（email, key, projectId）
3. HELPER_MAPPING を更新（シート名 → ヘルパーID）

### ステップ4: 同期の実行
1. Apps Script で `syncSheetToFirestore` 関数を実行
2. 承認画面で許可
3. Firestore の `shifts` コレクションにデータが保存される

### ステップ5: 個人シフト画面で確認
1. 個人シフト画面を開く
2. Firestoreからリアルタイムで取得・表示される

## ✅ 完了した変更

### 1. `sync-sheet-to-firestore.gs` - 作成
- スプレッドシートの各シートを読み取り
- セルデータをパース（時間、利用者名、サービス種別、稼働時間、エリア）
- Firestoreの `shifts` コレクションに保存
- スプレッドシートにメニュー追加

### 2. `PersonalShift.tsx` - 更新
**変更前**:
```typescript
// Google Apps Script API からポーリング（5秒ごと）
const API_URL = 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE';
const response = await fetch(url);
const interval = setInterval(fetchShiftsFromSheet, 5000);
```

**変更後**:
```typescript
// Firestore からリアルタイム取得（onSnapshot）
const shiftsRef = collection(db, 'shifts');
const q = query(
  shiftsRef,
  where('helperId', '==', helper.id),
  where('deleted', '==', false)
);
const unsubscribe = onSnapshot(q, (snapshot) => {
  // リアルタイム更新
});
```

### 3. `SETUP_FIRESTORE_SYNC.md` - 作成
- 詳細な設定手順ドキュメント
- トラブルシューティング
- データ形式の説明

## 📊 データ形式

### スプレッドシートのセル形式
各シフト（1セル）は4行で構成：
```
11:30-13:00          ← 時間範囲
美野(家事)           ← 利用者名(サービス種別)
1.5                  ← 稼働時間
城東区               ← エリア
```

### Firestoreに保存されるデータ
```javascript
{
  id: "shift-1-2025-12-01-0",
  date: "2025-12-01",
  helperId: "1",
  clientName: "美野",
  serviceType: "kaji",
  startTime: "11:30",
  endTime: "13:00",
  duration: 1.5,
  area: "城東区",
  rowIndex: 0,
  cancelStatus: null,
  deleted: false,
  updatedAt: "2025-12-30T..."
}
```

## 🎯 利用シーン

### 日常的な使い方
1. **シフト編集**: Googleスプレッドシートで通常通りシフトを編集
2. **同期**: スプレッドシートのメニュー「🔄 Firestore同期」→「📤 Firestoreに同期」
3. **確認**: 個人シフト画面が自動的に更新される（ブラウザ更新不要）

### 初回セットアップ時
1. Firebase サービスアカウント作成
2. Apps Script ライブラリ追加
3. 同期スクリプト設定
4. テスト同期実行
5. 個人シフト画面で確認

## 🔧 技術詳細

### 使用技術
- **Google Apps Script**: スプレッドシートデータの読み取りと同期
- **FirestoreApp ライブラリ**: Apps Script から Firestore への書き込み
- **Firebase Firestore**: データストレージ
- **React 19.2.0**: フロントエンド
- **onSnapshot**: Firestore リアルタイム監視

### セキュリティ
- Firebase サービスアカウントを使用（安全な認証）
- スプレッドシートと Firestore 間は HTTPS 通信
- 個人シフト画面はトークン認証（personalToken）

### パフォーマンス
- **同期**: 手動実行（必要に応じて自動化可能）
- **個人シフト**: onSnapshot によるリアルタイム更新（ポーリング不要）
- **表示**: React memo 最適化済み

## 🆘 トラブルシューティング

問題が発生した場合は `SETUP_FIRESTORE_SYNC.md` のトラブルシューティングセクションを参照してください。

主な確認ポイント：
1. Firebase 設定が正しいか（email, key, projectId）
2. HELPER_MAPPING が正しいか（シート名とヘルパーID）
3. スプレッドシートのデータ形式が正しいか（4行形式）
4. Apps Script の実行ログでエラーがないか
5. Firestore Console でデータが保存されているか

## 📝 更新履歴

- **2025-12-30**: 初版作成
  - スプレッドシート → Firestore 同期機能実装
  - PersonalShift.tsx を Firestore リアルタイム取得に変更
  - 設定ドキュメント作成
