# シフト管理システム 同期とパフォーマンス改善

## 実装日: 2026年1月2日

## 対応した問題と解決策

### 問題1: マスターシフト → 個人シフトの同期遅延・不整合

#### 問題の原因
1. **helperId型の不一致**: マスターシフトでは文字列、個人シフトクエリでは数値として扱われることがあった
2. **メタデータ変更の未監視**: Firestore onSnapshotでメタデータ変更を監視していなかった

#### 実装した解決策
1. **helperId正規化**
   - 個人シフトでhelperIdを文字列に統一 `String(helper.id)`
   - クエリ実行前に型を正規化することで、確実にデータを取得

2. **リアルタイム同期の強化**
   ```typescript
   onSnapshot(
     q,
     {
       // メタデータ変更も監視（保留中の書き込みも検知）
       includeMetadataChanges: true
     },
     (snapshot) => {
       // 変更の詳細をトラッキング
       const changes = snapshot.docChanges();
       // リアルタイムで更新を反映
     }
   )
   ```

3. **デバッグログの追加**
   - 同期状態の詳細なログ出力
   - 変更検知（added, modified, removed）の表示
   - キャッシュ状態とペンディング書き込みの確認

### 問題2: スクロール時のUI表示遅延

#### 実装した最適化
1. **スクロール検知の高速化**
   - デバウンス時間を150ms → 100msに短縮
   - `requestAnimationFrame`を使用したスムーズな処理

2. **遅延ローディングフックの作成**
   - `useLazyLoad`フックでIntersection Observerを実装
   - 表示領域外の要素を遅延レンダリング
   - 100px手前から先読みすることでスムーズな表示

3. **CSS Containmentの活用**（既存）
   - `contain: layout style paint`でレンダリング範囲を限定

4. **React.memoによる最適化**（既存）
   - 不要な再レンダリングを防止

## テスト方法

### 1. 同期テスト

#### 前提条件
- マスターシフト表（`/`）と個人シフト表（`/personal/[token]`）を別タブで開く
- ブラウザの開発者ツールでコンソールを開く

#### テスト手順
1. **新規シフト追加テスト**
   - マスターシフトで新しいケア内容を入力
   - 個人シフトタブを確認 → **即座に反映されることを確認**
   - コンソールで「🔄 Firestore更新検知」ログを確認

2. **シフト編集テスト**
   - マスターシフトで既存のケア内容を編集
   - 個人シフトタブで変更が**リアルタイムで反映**されることを確認

3. **キャンセル操作テスト**
   - マスターシフトでケア内容をキャンセル
   - 個人シフトで赤背景表示になることを確認
   - キャンセル解除後、通常表示に戻ることを確認

4. **複数シフト一括操作テスト**
   - マスターシフトで日付単位でコピー＆ペースト
   - 個人シフトですべての変更が反映されることを確認

#### 期待される結果
- すべての変更が**1秒以内**に個人シフトに反映される
- コンソールに以下のログが表示される：
  ```
  🔄 Firestore更新検知: { hasPendingWrites: false, isFromCache: false, changes: [...] }
  📝 変更検出: X件の変更
  ```

### 2. パフォーマンステスト

#### スクロールテスト
1. **高速スクロールテスト**
   - シフト表を素早く上下にスクロール
   - UIが崩れないことを確認
   - フリーズしないことを確認

2. **大量データテスト**
   - 複数月のシフトデータがある状態でスクロール
   - スムーズに表示されることを確認

#### パフォーマンス測定
Chrome DevToolsのPerformanceタブで測定：
1. Recording開始
2. シフト表を上下にスクロール（10秒間）
3. Recording停止
4. 以下を確認：
   - FPS: 30fps以上を維持
   - Scripting時間: 全体の50%以下
   - Rendering時間: スパイクがないこと

### 3. エラーハンドリングテスト

1. **ネットワーク切断テスト**
   - DevToolsでネットワークをオフライン設定
   - 個人シフトがキャッシュから表示されることを確認
   - コンソールに「isFromCache: true」が表示される

2. **権限エラーテスト**
   - 無効なトークンでアクセス
   - エラーメッセージが適切に表示される

## 技術仕様

### データフロー
```
マスターシフト（ShiftTable.tsx）
    ↓ saveShiftsForMonth()
Firestore（shiftsコレクション）
    ↓ onSnapshot（リアルタイム）
個人シフト（PersonalShift.tsx）
```

### 使用技術
- **リアルタイム同期**: Firestore onSnapshot
- **パフォーマンス最適化**:
  - requestAnimationFrame
  - React.memo
  - CSS Containment
  - Intersection Observer（遅延ローディング）
  - useRef（不要な再レンダリング防止）

### 重要なファイル
- `/src/components/PersonalShift.tsx` - 個人シフト表示（同期強化）
- `/src/hooks/useScrollDetection.ts` - スクロール検知（最適化）
- `/src/hooks/useLazyLoad.ts` - 遅延ローディング（新規作成）
- `/src/services/firestoreService.ts` - Firestore操作

## トラブルシューティング

### 同期が反映されない場合
1. コンソールでhelperIdの型を確認
   ```
   originalHelperIdType: "number" → 問題あり
   normalizedHelperIdType: "string" → 正常
   ```

2. Firestoreのデータを確認
   - Firebaseコンソールで`shifts`コレクションを確認
   - helperIdフィールドの型が文字列であることを確認

3. キャッシュをクリア
   - ブラウザのキャッシュをクリア
   - localStorageの`personalShiftToken`を確認

### パフォーマンスが改善されない場合
1. Chrome拡張機能を無効化
2. React DevToolsのProfilerで再レンダリングを確認
3. ネットワーク速度を確認（低速の場合は先読み範囲を調整）

## 今後の改善案
1. **WebWorkerの活用**: 重い計算処理をバックグラウンドで実行
2. **IndexedDBキャッシュ**: オフライン対応の強化
3. **GraphQL Subscriptions**: より効率的なリアルタイム更新
4. **Virtual Scrolling完全実装**: react-windowを使用した完全な仮想化