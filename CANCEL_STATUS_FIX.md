# キャンセル状態の保存バグ修正

## 問題
- キャンセルしたケア内容が読み込み直すとキャンセル状態が外れる
- キャンセル情報が正しく保存されていない

## 原因
1. **キャンセル処理時の問題**
   - `cancelStatus`が常に`'keep_time'`に固定されていた
   - 時間数（duration）に応じた適切な設定がされていなかった

2. **キャンセル解除時の問題**
   - `cancelStatus`は`undefined`に設定されていたが、`canceledAt`が残っていた
   - 両方のフィールドを同時にクリアする必要があった

## 修正内容

### 1. ShiftTable.tsx（キャンセル処理）
**修正箇所**: 3066-3081行目

```typescript
// 修正前
const shift: Shift = {
  // ...
  cancelStatus: 'keep_time',  // 常に固定値
  // ...
};

// 修正後
const duration = parseFloat(durationStr) || 0;
const shift: Shift = {
  // ...
  cancelStatus: duration === 0 ? 'remove_time' : 'keep_time',  // durationに応じて設定
  // ...
};
```

### 2. ShiftTable.tsx（キャンセル解除処理）
**修正箇所**: 2841-2847行目

```typescript
// 修正前
const restoredShift: Shift = {
  ...existingShift,
  cancelStatus: undefined  // canceledAtが残る
};

// 修正後
const restoredShift: Shift = {
  ...existingShift,
  cancelStatus: undefined,
  canceledAt: undefined  // 両方をクリア
};
```

## 技術詳細

### キャンセル状態の種類
- `keep_time`: 時間を残す（duration > 0）
- `remove_time`: 時間を削除（duration === 0）
- `undefined`: キャンセルなし（通常状態）

### Firestore保存時の処理
- `sanitizeForFirestore`関数により`undefined`のフィールドは自動的に削除される
- これにより、キャンセル解除時にフィールドがFirestoreから完全に削除される

## 動作確認
1. シフトをキャンセル（時間残す/削除）
2. ページを再読み込み
3. キャンセル状態が維持されることを確認
4. キャンセルを取り消し
5. ページを再読み込み
6. 通常状態に戻ることを確認

## 影響範囲
- シフト表のキャンセル機能
- Firestoreへの保存処理
- 給与計算（キャンセル状態により計算が変わる）