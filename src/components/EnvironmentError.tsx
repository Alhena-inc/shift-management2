import React from 'react';
import type { EnvCheckResult } from '../utils/envChecker';

interface EnvironmentErrorProps {
  checkResult: EnvCheckResult;
  isDevelopment: boolean;
}

/**
 * 環境変数エラー表示コンポーネント
 * 必須の環境変数が不足している場合に表示される
 */
export const EnvironmentError: React.FC<EnvironmentErrorProps> = ({
  checkResult,
  isDevelopment
}) => {
  return (
    <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-lg shadow-xl p-8">
        <div className="flex items-center mb-6">
          <div className="bg-red-100 rounded-full p-3 mr-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              環境設定エラー
            </h1>
            <p className="text-gray-600">
              アプリケーションの起動に必要な設定が不足しています
            </p>
          </div>
        </div>

        {checkResult.missingVars.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-red-700 mb-3">
              ❌ 必須の環境変数が設定されていません:
            </h2>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <ul className="space-y-1">
                {checkResult.missingVars.map((varName) => (
                  <li key={varName} className="flex items-start">
                    <span className="text-red-500 mr-2">•</span>
                    <code className="text-sm bg-red-100 px-2 py-0.5 rounded">
                      {varName}
                    </code>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {checkResult.warnings.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-amber-700 mb-3">
              ⚠️ 警告:
            </h2>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <ul className="space-y-1">
                {checkResult.warnings.map((warning, index) => (
                  <li key={index} className="flex items-start">
                    <span className="text-amber-500 mr-2">•</span>
                    <span className="text-sm text-gray-700">{warning}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-blue-900 mb-2">
            📝 設定方法:
          </h3>
          <ol className="space-y-2 text-sm text-gray-700">
            <li>
              <span className="font-semibold">1.</span> プロジェクトルートに
              <code className="bg-gray-100 px-2 py-0.5 rounded mx-1">.env</code>
              ファイルを作成
            </li>
            <li>
              <span className="font-semibold">2.</span>
              <code className="bg-gray-100 px-2 py-0.5 rounded mx-1">.env.example</code>
              を参考に必要な値を設定
            </li>
            <li>
              <span className="font-semibold">3.</span> 開発サーバーを再起動
              <code className="bg-gray-100 px-2 py-0.5 rounded ml-2">npm run dev</code>
            </li>
          </ol>
        </div>

        {isDevelopment && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">
              🔧 開発モード情報:
            </h3>
            <div className="text-xs font-mono text-gray-600">
              <p>NODE_ENV: {import.meta.env.MODE}</p>
              <p>BASE_URL: {import.meta.env.BASE_URL}</p>
              <p className="mt-2 text-gray-500">
                詳細は docs/setup/ フォルダ内のドキュメントを参照してください
              </p>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-center">
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            設定後、ここをクリックして再読み込み
          </button>
        </div>
      </div>
    </div>
  );
};