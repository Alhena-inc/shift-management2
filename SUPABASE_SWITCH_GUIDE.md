# Supabase切り替えガイド

## 現在の状況
- **データ保存先**: Firebase Firestore
- **Supabaseデータ**: 移行済み（データはコピー済み）
- **切り替え準備**: 完了

## Supabaseへの切り替え方法

### 方法1: 環境変数で切り替え（推奨）

1. `.env.local`ファイルを編集
```env
# Supabaseを使用する場合
VITE_USE_SUPABASE=true

# Supabase設定
VITE_SUPABASE_URL=your_actual_supabase_url
VITE_SUPABASE_ANON_KEY=your_actual_anon_key
```

2. アプリケーションを再起動
```bash
npm run dev
```

3. コンソールで確認
```
📦 データサービス: Supabase
✅ Supabaseモードで動作中
```

### 方法2: コード直接修正

各コンポーネントのインポート文を変更:

**変更前（現在）**:
```typescript
import { loadHelpers, saveHelpers } from '../services/firestoreService';
```

**変更後**:
```typescript
import { loadHelpers, saveHelpers } from '../services/dataService';
```

### 切り替え前のチェックリスト

- [ ] Supabase環境変数が設定されている
- [ ] 最新データをFirebaseからSupabaseに移行済み
- [ ] バックアップを取得済み
- [ ] テスト環境で動作確認済み

### 段階的移行手順

1. **テスト環境で確認**
   - `VITE_USE_SUPABASE=true`に設定
   - 全機能の動作確認

2. **本番環境で並行稼働**
   - 一部ユーザーのみSupabase使用
   - 問題がないか監視

3. **完全移行**
   - すべてのユーザーをSupabaseへ
   - Firebaseを無効化

### トラブルシューティング

#### エラー: データが表示されない
- Supabase環境変数が正しく設定されているか確認
- `npm run migrate-to-supabase`で最新データを移行

#### エラー: 保存できない
- Supabase RLS（Row Level Security）設定を確認
- ANONキーの権限を確認

#### FirebaseからSupabaseへの再同期
```bash
# 最新データを再移行
npm run migrate-to-supabase
```

### ロールバック方法

Firebaseに戻す場合:
```env
VITE_USE_SUPABASE=false
```

## 注意事項

⚠️ **重要**: FirebaseとSupabaseのデータは自動同期されません。
- 切り替え前に必ず最新データを移行してください
- 並行稼働時は手動同期が必要です

## サポート

問題が発生した場合:
1. コンソールログを確認
2. ネットワークタブでAPIレスポンスを確認
3. Supabaseダッシュボードでログを確認