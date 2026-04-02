# のあスタッフポータル - プロジェクト設計書

## 技術スタック
| 項目 | 技術 |
|------|------|
| フレームワーク | Next.js 14 (App Router) |
| データベース | Supabase (PostgreSQL) |
| 認証 | LINE Login → Supabase Auth |
| ホスティング | Vercel |
| LINE通知 | LINE Messaging API |
| スタイリング | Tailwind CSS |
| 状態管理 | React Server Components + SWR |

## ディレクトリ構成
```
src/
├── app/
│   ├── layout.tsx              # ルートレイアウト
│   ├── page.tsx                # ログインページ
│   ├── auth/
│   │   └── callback/route.ts   # LINE Login コールバック
│   ├── (portal)/               # 認証必須グループ
│   │   ├── layout.tsx          # ポータルレイアウト (ヘッダー等)
│   │   ├── clients/
│   │   │   ├── page.tsx        # 利用者一覧
│   │   │   └── [id]/
│   │   │       ├── page.tsx    # 利用者詳細（タブ切替）
│   │   │       ├── assessment/
│   │   │       │   └── edit/page.tsx  # アセスメント編集 (サ責/管理者)
│   │   │       └── procedures/
│   │   │           ├── new/page.tsx   # 手順書作成
│   │   │           └── [procId]/
│   │   │               ├── page.tsx   # 手順書詳細
│   │   │               └── edit/page.tsx # 手順書編集
│   │   ├── approvals/
│   │   │   └── page.tsx        # 承認待ち一覧 (サ責/管理者)
│   │   └── admin/
│   │       ├── clients/
│   │       │   ├── new/page.tsx      # 利用者新規登録
│   │       │   ├── import/page.tsx   # CSVインポート
│   │       │   └── [id]/edit/page.tsx # 利用者編集
│   │       └── staff/page.tsx        # スタッフ管理 (管理者)
│   └── api/
│       ├── line-notify/route.ts      # LINE通知送信
│       └── csv-import/route.ts       # CSVインポート処理
├── components/
│   ├── ui/                    # 共通UIコンポーネント
│   ├── client/                # 利用者関連
│   ├── assessment/            # アセスメント関連
│   └── procedure/             # 手順書関連
├── lib/
│   ├── supabase/
│   │   ├── client.ts          # ブラウザ用クライアント
│   │   ├── server.ts          # サーバー用クライアント
│   │   └── middleware.ts      # 認証ミドルウェア
│   ├── line/
│   │   ├── auth.ts            # LINE Login処理
│   │   └── notify.ts          # LINE通知送信
│   └── utils.ts
└── types/
    └── database.ts            # Supabase型定義
```

## 権限マトリクス
| 機能 | ヘルパー | サ責 | 管理者 |
|------|---------|------|--------|
| 利用者一覧（担当のみ） | ✅ | - | - |
| 利用者一覧（全員） | ❌ | ✅ | ✅ |
| 基本情報閲覧 | ✅(担当) | ✅ | ✅ |
| 基本情報編集 | ❌ | ✅ | ✅ |
| アセスメント閲覧 | ✅(担当) | ✅ | ✅ |
| アセスメント編集 | ❌ | ✅ | ✅ |
| 手順書閲覧(承認済) | ✅(担当) | ✅ | ✅ |
| 手順書作成/編集依頼 | ✅ | ✅ | ✅ |
| 手順書承認/却下 | ❌ | ✅ | ✅ |
| CSVインポート | ❌ | ✅ | ✅ |
| スタッフ管理 | ❌ | ❌ | ✅ |

## 手順書承認フロー
```
ヘルパーが作成 → status: draft
    ↓ 提出
status: pending → LINE通知(サ責へ)
    ↓ サ責が確認
承認 → status: approved → 本番表示
却下 → status: rejected → ヘルパーに差し戻し(理由付き)
    ↓ ヘルパーが修正
status: draft → 再提出...
```

## パフォーマンス最適化方針
- React Server Components でサーバーサイドレンダリング
- 利用者一覧: ISR + SWR で高速キャッシュ
- アセスメント: JSONB一括取得（N+1クエリ防止）
- 画像なし・最小限のJSバンドル
- Tailwind CSS の purge で未使用CSS除去
- フォント: system-ui + Noto Sans JP (swap)
