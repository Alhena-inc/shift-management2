# シフト同期テスト チェックリスト

## 実行手順

### ステップ1: 大元シフトでシフトを編集

1. **ブラウザを開く**: `http://localhost:5173/`
2. **F12で開発者ツールを開く**
3. **Console タブを選択**
4. **シフト管理をクリック**
5. **任意のセルをクリックして編集**:
   ```
   例:
   16:00-19:00
   今井(行動)
   3
   阿倍野区
   ```

6. **保存（Enterキー）**

7. **コンソールで以下を確認**:

#### ✅ チェック1: 保存データの確認

コンソールに以下のログが表示されるか確認:

```
💾 シフト保存（完全上書き）: {
  collection: "shifts",
  id: "shift-1-2025-12-31-0",
  helperId: "1",                    ← helperIdが存在するか
  helperIdType: "string",           ← 型が"string"か
  date: "2025-12-31",              ← 日付が正しいか
  clientName: "今井",               ← 利用者名が保存されているか
  serviceType: "kodo_engo",         ← サービスタイプが保存されているか
  startTime: "16:00",               ← 開始時刻が保存されているか
  endTime: "19:00",                 ← 終了時刻が保存されているか
  duration: 3,                      ← 稼働時間が保存されているか
  area: "阿倍野区",                 ← 地域が保存されているか
  rowIndex: 0,
  cancelStatus: undefined,
  canceledAt: undefined,
  deleted: false,                   ← deletedがfalseか
  hasUndefinedFields: ["cancelStatus", "canceledAt"]
}
```

**問題がある場合**:
- ❌ `helperId`がundefined → ヘルパーIDの取得に問題
- ❌ `clientName`が空 → セルの解析に問題
- ❌ `deleted`がundefined → シフトオブジェクトの生成に問題

#### ✅ チェック2: サニタイズ後のデータ確認

```
📦 サニタイズ後のデータ: {
  id: "shift-1-2025-12-31-0",
  helperId: "1",                    ← helperIdが残っているか
  date: "2025-12-31",
  clientName: "今井",               ← フィールドが残っているか
  serviceType: "kodo_engo",
  startTime: "16:00",
  endTime: "19:00",
  duration: 3,
  area: "阿倍野区",
  rowIndex: 0,
  deleted: false,
  updatedAt: Timestamp { ... }
}
```

**問題がある場合**:
- ❌ 重要なフィールドが消えている → sanitize関数に問題

---

### ステップ2: 個人シフトで確認

1. **別のブラウザまたはシークレットウィンドウを開く**
2. **F12で開発者ツールを開く**
3. **Console タブを選択**
4. **個人シフトURLを開く**:
   - `http://localhost:5173/personal/<token>`
   - トークンはヘルパー管理画面で取得

5. **コンソールで以下を確認**:

#### ✅ チェック3: クエリ条件の確認

```
📥 Firestoreからデータ取得開始: 広瀬 (helperId: 1, 型: string)

🔍 クエリ条件: {
  helperId: "1",                    ← 大元シフトと同じhelperIdか
  helperIdType: "string",           ← 型が"string"か
  deleted: false
}
```

**問題がある場合**:
- ❌ helperIdの型が異なる（number vs string）
- ❌ helperIdの値が異なる

#### ✅ チェック4: データ取得の確認

```
✅ Firestoreからデータ取得成功: 15 件

🔍 取得したシフト（最初の3件・詳細）: [
  {
    id: "shift-1-2025-12-31-0",
    helperId: "1",                  ← 取得できているか
    helperIdType: "string",
    date: "2025-12-31",
    clientName: "今井",             ← ケア内容が取得できているか
    serviceType: "kodo_engo",
    startTime: "16:00",
    endTime: "19:00",
    duration: 3,
    area: "阿倍野区",
    rowIndex: 0,
    cancelStatus: undefined,
    deleted: false
  },
  ...
]

📊 全フィールドサンプル（1件目）: { ... }
```

**問題がある場合**:
- ❌ 取得件数が0件 → クエリ条件が間違っている
- ❌ フィールドが空 → 保存時に問題

---

## よくある問題と解決策

### 問題1: 個人シフトで取得件数が0件

**原因**: helperIdの型が不一致

**確認方法**:
```
大元シフト: helperIdType: "string"
個人シフト: helperIdType: "string"  ← 一致しているか？
```

**解決策**:
```typescript
// helpers配列を読み込む際にIDをstring型に統一
const loadedHelpers = await loadHelpers();
const helpers = loadedHelpers.map(h => ({
  ...h,
  id: String(h.id)  // 必ずstringに変換
}));
```

### 問題2: ケア内容が空

**原因**: undefinedのフィールドがsanitizeで削除された

**確認方法**:
```
💾 シフト保存: {
  clientName: undefined,  ← undefinedになっていないか？
  ...
}
```

**解決策**:
```typescript
// シフトオブジェクト作成時にデフォルト値を設定
const newShift: Shift = {
  ...
  clientName: clientName || '',      // 空文字をデフォルト
  startTime: startTime || '',
  endTime: endTime || '',
  duration: parseFloat(durationStr) || 0,
  area: area || '',
  deleted: false                      // 必ず設定
};
```

### 問題3: deletedフィールドがない

**原因**: 古いシフトデータにdeletedフィールドが存在しない

**解決策**:
```typescript
// クエリ条件を修正
const q = query(
  shiftsRef,
  where('helperId', '==', helper.id)
  // where('deleted', '==', false)  ← 削除するか、または
);

// またはデータ取得後にフィルタ
const activeShifts = fetchedShifts.filter(s => s.deleted !== true);
```

---

## 次のステップ

1. 上記のチェックリストに従ってテスト
2. コンソールログをスクリーンショットで保存
3. 問題があれば、該当するチェックポイントの番号を伝える
4. 具体的な修正方法を提案

---

## 緊急対応: deletedフィールド問題の回避策

もし古いデータにdeletedフィールドがなくて取得できない場合、一時的に以下を試してください:

### PersonalShift.tsxの修正

```typescript
// where('deleted', '==', false) を削除または条件を緩和
const q = query(
  shiftsRef,
  where('helperId', '==', helper.id)
);

// onSnapshotの中でフィルタ
const unsubscribe = onSnapshot(q, (snapshot) => {
  const allShifts = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as Shift[];

  // deletedがtrueのものを除外（deletedがundefinedの場合は含める）
  const activeShifts = allShifts.filter(s => s.deleted !== true);

  setShifts(activeShifts);
  ...
});
```

この修正により、deletedフィールドがないデータも取得できるようになります。
