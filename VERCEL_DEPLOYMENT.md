# Vercel デプロイメント設定

## ✅ デプロイメントエラーの修正完了
2026年1月2日: TypeScriptの構文エラーを修正し、ビルドが成功するようになりました。

## 🚀 デプロイ状況
- **リポジトリ**: https://github.com/Alhena-inc/shift-management2.git
- **ブランチ**: main
- **プラットフォーム**: Vercel

## 📋 必要な環境変数
Vercelダッシュボードの Settings > Environment Variables に以下を設定してください:

### Google API関連
```
VITE_GOOGLE_API_KEY=your_google_api_key_here
VITE_GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
VITE_GOOGLE_SHEETS_PAYROLL_ID=1asgiOLpVlrE6hZ1en_CnqIXa_JCZxjRUSW4kpbGcwMY
```

### アプリケーション設定
```
VITE_APP_URL=https://your-app.vercel.app
```

## 🔧 ビルド設定
**Framework Preset**: Vite
**Build Command**: `npm run build`
**Output Directory**: `dist`
**Install Command**: `npm install`

## 📁 プロジェクト構造
```
shift-table/
├── src/
│   ├── components/      # Reactコンポーネント
│   ├── services/        # APIサービス層
│   ├── hooks/          # カスタムフック
│   ├── lib/            # ライブラリ設定（Firebase等）
│   └── types/          # TypeScript型定義
├── dist/              # ビルド出力
├── vercel.json        # Vercel設定（SPAルーティング）
└── package.json       # 依存関係

```

## ⚠️ 注意事項

### 1. Firebase設定
現在、Firebase設定は `/src/lib/firebase.ts` にハードコードされています。
セキュリティのため、将来的に環境変数への移行を検討してください。

### 2. ビルドサイズ警告
現在のビルドサイズが大きい（約1.8MB）ため、以下の最適化を検討してください:
- 動的インポートによるコード分割
- 不要な依存関係の削除
- Tree shaking の最適化

### 3. Node.jsバージョン
推奨: Node.js 18.x 以上

## 🔍 トラブルシューティング

### ビルドエラーが発生した場合
1. ローカルで `npm run build` を実行してエラーを確認
2. TypeScriptエラーがないか確認
3. 依存関係が正しくインストールされているか確認

### デプロイ後にアプリが動作しない場合
1. ブラウザの開発者ツールでコンソールエラーを確認
2. 環境変数が正しく設定されているか確認
3. Firebaseの権限設定を確認

## 📝 更新履歴
- 2026/01/02: 構文エラー修正（ShiftTable.tsx L4630）
- 2026/01/02: ドキュメント作成