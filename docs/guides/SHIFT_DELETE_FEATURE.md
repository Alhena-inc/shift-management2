# シフトデータ削除機能 実装完了（日付単位）

## 実装概要
シフト管理ソフトに「シフトデータ削除」機能を追加しました。この機能により、指定した日付のシフトデータを一括削除できます。

## 最新の修正内容

### 問題と解決
1. **データ参照先の問題**
   - **問題**: シフト表に入力されているデータが「ありません」と表示される
   - **原因**: `payslips`コレクションの`careList`を参照していたが、実際のシフトデータは`shifts`コレクションに保存されていた
   - **解決**: `shifts`コレクションから削除するように修正

2. **削除後の画面更新問題**
   - **問題**: データ削除後、ページを再読み込みしないと削除が視覚的に反映されない
   - **原因**: 削除後にシフトデータの再読み込み処理がなかった
   - **解決**: `onDeleteComplete`コールバックを追加して、削除成功後にシフトデータを自動的に再読み込み

## 主な変更点

### 1. データ参照先の変更
- **旧**: `payslips`コレクションの`careList`フィールド
- **新**: `shifts`コレクションの各シフトドキュメント

### 2. 日付単位での削除
- 現在表示中のシフト表の年月を自動取得
- 日付をドロップダウンで選択
- 選択した日のシフトデータのみを削除

### 3. UIの改善
- 選択ボックスの背景色を白に変更
- ラベルを「ケア内容」から「シフトデータ」に統一

### 4. 画面自動更新機能
- 削除完了後、シフトデータを自動的に再読み込み
- ページ再読み込み不要で即座に削除結果が反映
- `onDeleteComplete`コールバックによる非同期処理

## ファイル構成

### `/src/components/CareContentDeleter.tsx`
- シフトデータ削除のUIコンポーネント
- 日付選択機能（現在の年月から自動取得）
- データ件数確認機能
- 削除確認ダイアログ
- エラーハンドリングとメッセージ表示

### `/src/services/careContentService.ts`
- Firestoreとの連携処理
- `getCareContentCountByDate` - 指定日のシフト件数取得
- `deleteCareContentByDate` - 指定日のシフトを論理削除
- `saveDeletionLog` - 削除ログの保存

### `/src/App.tsx`
- 「🗑️ シフトデータ削除」ボタンを追加
- 現在の年月をコンポーネントに渡す

## 機能詳細

### 1. データ構造
```typescript
interface Shift {
  id: string;
  date: string;           // YYYY-MM-DD
  helperId: string;
  clientName: string;     // 利用者名
  serviceType: ServiceType;
  startTime: string;      // HH:mm
  endTime: string;        // HH:mm
  duration: number;       // 時間数
  area: string;           // 区域
  sequence?: number;      // 連番
  deleted?: boolean;      // 論理削除フラグ
  deletedAt?: any;        // 削除日時
  deletedBy?: string;     // 削除者ID
}
```

### 2. 削除処理
- **論理削除**: `deleted: true`フラグを設定
- **削除日時**: `deletedAt`に現在時刻を記録
- **削除者**: `deletedBy`に実行者を記録
- **バッチ処理**: 複数のシフトを効率的に削除

### 3. 削除履歴
`deletion_logs`コレクションに以下の情報を保存：
- 削除対象年月日（`targetYear`, `targetMonth`, `targetDay`）
- 削除件数（`deletedCount`）
- 削除日時（`deletedAt`）
- 実行者（`executedBy`）
- タイプ（`type: 'care_content'`）

## 使用方法

1. シフト管理画面を開く（例：2026年1月）
2. 「🗑️ シフトデータ削除」ボタンをクリック
3. 削除したい日付を選択（例：1月15日）
4. 「データ件数を確認」ボタンでシフト数を確認
5. データが存在する場合、削除ボタンが表示される
6. 削除ボタンをクリックし、確認ダイアログで「OK」を選択
7. 削除処理が実行され、完了メッセージが表示される

## セキュリティ考慮事項

- 削除前に必ず確認ダイアログを表示
- 削除は論理削除（データは物理的に残る）
- 削除履歴を保存して監査証跡を残す
- トランザクション処理（バッチ）で整合性を保証

## 技術仕様

### Firestoreクエリ
```typescript
// 日付でシフトを検索
const q = query(
  collection(db, 'shifts'),
  where('date', '==', dateString)
);

// 論理削除の更新
batch.update(docRef, {
  deleted: true,
  deletedAt: Timestamp.now(),
  deletedBy: 'system',
  updatedAt: Timestamp.now()
});
```

### 画面自動更新処理
```typescript
// CareContentDeleter.tsx
onDeleteComplete={() => {
  // 削除完了時のコールバック
});

// App.tsx
onDeleteComplete={async () => {
  // シフトデータを再読み込み
  const loadedShifts = await loadShiftsForMonth(currentYear, currentMonth);
  setShifts(loadedShifts);
}}
```

## 注意事項

- 削除したデータは画面上から消えるが、Firestore上には論理削除として残る
- 削除フラグ（`deleted: true`）を外せば復元可能
- 本番環境での使用前に、必ずテスト環境で動作確認を行ってください
- 削除履歴は`deletion_logs`コレクションに保存されます