# シフト同期デバッグガイド

## 問題
大元シフトで編集した内容が個人シフトに反映されない

## デバッグログを追加しました

以下の箇所にデバッグログを追加し、データの流れを追跡できるようにしました。

### 1. 保存処理（firestoreService.ts）

**場所**: `src/services/firestoreService.ts:147-166`

**ログ内容**:
- 💾 シフト保存（完全上書き）
- helperId、helperIdType（型）
- 全フィールド（clientName, serviceType, startTime, endTime, duration, area等）
- undefinedのフィールド一覧
- 📦 サニタイズ後のデータ

### 2. 個人シフト取得処理（PersonalShift.tsx）

**場所**: `src/components/PersonalShift.tsx:108-147`

**ログ内容**:
- 📥 Firestoreからデータ取得開始（helperId、型）
- 🔍 クエリ条件（helperId、型、deleted）
- ✅ Firestoreからデータ取得成功（件数）
- 🔍 取得したシフト（最初の3件・詳細）
- 📊 全フィールドサンプル（1件目）

## テスト手順

### 1. 大元シフトでシフトを編集

1. ブラウザで`http://localhost:5173/`にアクセス
2. F12キーを押して開発者ツールを開く
3. Consoleタブを表示
4. 「シフト管理」をクリック
5. シフト表でセルを編集（利用者名、時間、サービス種別など）
6. **コンソールで以下のログを確認**:

```
💾 シフト保存（完全上書き）: {
  collection: "shifts",
  id: "shift-1-2025-12-31-0",
  helperId: "1",
  helperIdType: "string",     ← 型を確認
  date: "2025-12-31",
  clientName: "山田太郎",      ← 利用者名が保存されているか
  serviceType: "kaji",         ← サービス種別が保存されているか
  startTime: "09:00",          ← 開始時刻が保存されているか
  endTime: "12:00",            ← 終了時刻が保存されているか
  duration: 3,                 ← 稼働時間が保存されているか
  area: "大阪市",              ← 地域が保存されているか
  rowIndex: 0,
  cancelStatus: undefined,
  canceledAt: undefined,
  deleted: false,
  hasUndefinedFields: ["cancelStatus", "canceledAt"]  ← undefinedフィールド
}

📦 サニタイズ後のデータ: { ... }  ← 実際にFirestoreに保存されるデータ
```

### 2. 個人シフトで確認

1. 別のブラウザまたはシークレットウィンドウで個人シフトを開く
2. URL: `http://localhost:5173/personal/<token>`
   - トークンはヘルパー管理画面のリンクアイコンから取得
3. F12キーで開発者ツールを開く
4. **コンソールで以下のログを確認**:

```
📥 Firestoreからデータ取得開始: 広瀬 (helperId: 1, 型: string)  ← helperIdの型を確認

🔍 クエリ条件: {
  helperId: "1",
  helperIdType: "string",     ← 保存時の型と一致しているか
  deleted: false
}

✅ Firestoreからデータ取得成功: 15 件

🔍 取得したシフト（最初の3件・詳細）: [
  {
    id: "shift-1-2025-12-31-0",
    helperId: "1",              ← 保存時と同じhelperIdか
    helperIdType: "string",     ← 型が一致しているか
    date: "2025-12-31",
    clientName: "山田太郎",      ← 利用者名が取得できているか
    serviceType: "kaji",         ← サービス種別が取得できているか
    startTime: "09:00",          ← 開始時刻が取得できているか
    endTime: "12:00",            ← 終了時刻が取得できているか
    duration: 3,                 ← 稼働時間が取得できているか
    area: "大阪市",              ← 地域が取得できているか
    rowIndex: 0,
    cancelStatus: undefined,
    deleted: false
  },
  ...
]

📊 全フィールドサンプル（1件目）: { ... }  ← 全フィールドの内容
```

## チェックポイント

### ✅ 保存側（大元シフト）

1. **helperIdTypeが"string"になっているか**
   - "number"の場合は型変換が必要

2. **重要フィールドがundefinedになっていないか**
   - clientName
   - serviceType
   - startTime
   - endTime
   - duration
   - area

3. **📦 サニタイズ後のデータに全フィールドが含まれているか**
   - undefinedのフィールドは除去される仕様

### ✅ 取得側（個人シフト）

1. **helperIdの型が保存時と一致しているか**
   - 保存: "string"
   - 取得: "string"
   - 不一致の場合、クエリが動作しない

2. **Firestore取得成功の件数が0件でないか**
   - 0件の場合、クエリ条件が間違っている可能性

3. **取得したシフトに全フィールドが含まれているか**
   - clientName, serviceType, startTime等がundefinedの場合、保存時に問題あり

## よくある問題と解決策

### 問題1: helperIdの型が不一致

**症状**: 個人シフトで取得件数が0件

**原因**: 保存時に`helperId: "1"`（string）、取得時に`helperId: 1`（number）など

**解決策**:
```typescript
// helpers配列でIDをstring型に統一
const helpers = loadedHelpers.map(h => ({
  ...h,
  id: String(h.id)  // 必ずstring型に変換
}));
```

### 問題2: 重要フィールドがundefined

**症状**: 個人シフトに時間や利用者名が表示されない

**原因**: サニタイズ処理でundefinedのフィールドが除去される

**解決策**:
```typescript
// シフト保存前にデフォルト値を設定
const shift: Shift = {
  id: `shift-${helperId}-${date}-${rowIndex}`,
  helperId,
  date,
  clientName: clientName || '',      // 空文字をデフォルト
  serviceType: serviceType || 'other',
  startTime: startTime || '',
  endTime: endTime || '',
  duration: duration || 0,
  area: area || '',
  rowIndex,
  deleted: false,                     // 必ずfalseを設定
  // ...
};
```

### 問題3: クエリ条件のdeletedフィールドが存在しない

**症状**: エラーは出ないが取得件数が0件

**原因**: 古いシフトデータにdeletedフィールドがない

**解決策**:
```typescript
// 保存時に必ずdeletedフィールドを含める
const shift = {
  ...otherFields,
  deleted: shift.deleted ?? false  // undefinedの場合はfalse
};
```

## 次のステップ

1. **上記のログを確認**して問題箇所を特定
2. **helperIdの型が一致しているか**確認
3. **重要フィールドがundefinedでないか**確認
4. **問題が見つかれば修正**してください

## 修正が必要な場合の連絡事項

コンソールのログをスクリーンショットで共有していただければ、具体的な修正方法を提案します。
