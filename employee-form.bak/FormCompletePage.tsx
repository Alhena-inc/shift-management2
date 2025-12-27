import { useEffect, useState } from 'react';

export const FormCompletePage: React.FC = () => {
  const [formId, setFormId] = useState<string | null>(null);

  useEffect(() => {
    // sessionStorageからformIdを取得
    const storedFormId = sessionStorage.getItem('employeeFormId');
    setFormId(storedFormId);

    // 取得後はクリア
    if (storedFormId) {
      sessionStorage.removeItem('employeeFormId');
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 py-16 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl p-8 sm:p-12 text-center">
          {/* 成功アイコン */}
          <div className="mb-8">
            <div className="mx-auto w-24 h-24 bg-green-100 rounded-full flex items-center justify-center">
              <svg
                className="w-16 h-16 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          </div>

          {/* メッセージ */}
          <h1 className="text-3xl font-bold text-gray-800 mb-4">
            登録完了！
          </h1>
          <p className="text-lg text-gray-600 mb-8">
            従業員情報の登録が完了しました。
          </p>

          {/* 詳細情報 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8 text-left">
            <h2 className="text-sm font-bold text-blue-800 mb-3">次のステップ</h2>
            <ul className="space-y-2 text-sm text-blue-700">
              <li className="flex items-start">
                <span className="mr-2">1.</span>
                <span>管理者が入力内容を確認します</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">2.</span>
                <span>確認完了後、登録されたメールアドレスに通知が届きます</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">3.</span>
                <span>不備がある場合は、担当者よりご連絡させていただきます</span>
              </li>
            </ul>
          </div>

          {formId && (
            <div className="mb-8">
              <p className="text-xs text-gray-500 mb-2">受付番号</p>
              <p className="text-lg font-mono font-bold text-gray-700 bg-gray-100 py-3 px-4 rounded-lg">
                {formId}
              </p>
              <p className="text-xs text-gray-500 mt-2">
                ※ お問い合わせの際は、この受付番号をお伝えください
              </p>
            </div>
          )}

          {/* アクション */}
          <div className="space-y-4">
            <button
              onClick={() => window.location.href = '/'}
              className="w-full px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-indigo-700 shadow-md hover:shadow-lg transition-all"
            >
              ホームに戻る
            </button>

            <button
              onClick={() => window.print()}
              className="w-full px-8 py-4 border-2 border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              この画面を印刷
            </button>
          </div>

          {/* 注意事項 */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              ご不明な点がございましたら、<br className="sm:hidden" />
              お気軽にお問い合わせください。
            </p>
            <p className="text-xs text-gray-500 mt-2">
              Alhena合同会社 訪問介護事業所のあ
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
