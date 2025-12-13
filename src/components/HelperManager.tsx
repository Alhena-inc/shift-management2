import { useState } from 'react';
import type { Helper } from '../types';

interface Props {
  helpers: Helper[];
  onUpdate: (helpers: Helper[]) => void;
  onClose: () => void;
}

export function HelperManager({ helpers, onUpdate, onClose }: Props) {
  const [newHelperName, setNewHelperName] = useState('');
  const [newHelperGender, setNewHelperGender] = useState<'male' | 'female'>('male');

  const handleAddHelper = () => {
    if (!newHelperName.trim()) {
      alert('ヘルパー名を入力してください');
      return;
    }

    // 男性と女性を分ける
    const maleHelpers = helpers.filter(h => h.gender === 'male');
    const femaleHelpers = helpers.filter(h => h.gender === 'female');

    // 新しいIDと順番を計算
    const maxId = Math.max(...helpers.map(h => parseInt(h.id)), 0);
    const newHelper: Helper = {
      id: String(maxId + 1),
      name: newHelperName.trim(),
      gender: newHelperGender,
      order: 0, // 仮の値
    };

    // 性別に応じて最後に追加
    let updatedHelpers: Helper[];
    if (newHelperGender === 'male') {
      updatedHelpers = [...maleHelpers, newHelper, ...femaleHelpers];
    } else {
      updatedHelpers = [...maleHelpers, ...femaleHelpers, newHelper];
    }

    // orderを再設定
    updatedHelpers = updatedHelpers.map((h, idx) => ({ ...h, order: idx + 1 }));

    onUpdate(updatedHelpers);
    setNewHelperName('');
    alert('ヘルパーを追加しました');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto">
        {/* ヘッダー */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold">ヘルパー追加</h1>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              ← シフト表に戻る
            </button>
          </div>
        </div>

        {/* メインコンテンツ */}
        <div className="bg-white rounded-lg shadow-md p-6">

          {/* フォーム */}
          <div className="space-y-6">
            <div>
              <label className="block text-lg font-medium mb-3">ヘルパー名</label>
              <input
                type="text"
                value={newHelperName}
                onChange={(e) => setNewHelperName(e.target.value)}
                placeholder="名前を入力"
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                onKeyDown={(e) => e.key === 'Enter' && handleAddHelper()}
                autoFocus
              />
            </div>

            <div>
              <label className="block text-lg font-medium mb-3">性別</label>
              <div className="flex gap-6">
                <label className="flex items-center gap-3 cursor-pointer p-4 border-2 rounded-lg hover:bg-gray-50 transition-colors"
                  style={{ borderColor: newHelperGender === 'male' ? '#3b82f6' : '#d1d5db' }}
                >
                  <input
                    type="radio"
                    value="male"
                    checked={newHelperGender === 'male'}
                    onChange={(e) => setNewHelperGender(e.target.value as 'male' | 'female')}
                    className="w-5 h-5"
                  />
                  <span className="text-3xl">👨</span>
                  <span className="text-lg font-medium">男性</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer p-4 border-2 rounded-lg hover:bg-gray-50 transition-colors"
                  style={{ borderColor: newHelperGender === 'female' ? '#ec4899' : '#d1d5db' }}
                >
                  <input
                    type="radio"
                    value="female"
                    checked={newHelperGender === 'female'}
                    onChange={(e) => setNewHelperGender(e.target.value as 'male' | 'female')}
                    className="w-5 h-5"
                  />
                  <span className="text-3xl">👩</span>
                  <span className="text-lg font-medium">女性</span>
                </label>
              </div>
            </div>
          </div>

          {/* ボタン */}
          <div className="flex gap-4 mt-8">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-lg font-medium"
            >
              キャンセル
            </button>
            <button
              onClick={handleAddHelper}
              className="flex-1 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-lg font-medium"
            >
              ➕ 追加する
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
