import { useState, useRef, useEffect, useCallback, memo } from 'react';
import type { Helper } from '../types';

// ランダムトークン生成関数（10文字）
const generateToken = (): string => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 10; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
};

interface Props {
  helpers: Helper[];
  onUpdate: (helpers: Helper[]) => void;
  onClose: () => void;
}

export const HelperManager = memo(function HelperManager({ helpers, onUpdate, onClose }: Props) {
  // 環境変数からベースURLを取得（開発環境ではlocalhost、本番環境ではVercel URL）
  const baseUrl = import.meta.env.VITE_APP_URL || window.location.origin;

  const [newHelperName, setNewHelperName] = useState('');
  const [newHelperLastName, setNewHelperLastName] = useState('');
  const [newHelperFirstName, setNewHelperFirstName] = useState('');
  const [newHelperGender, setNewHelperGender] = useState<'male' | 'female'>('male');
  const [showAddForm, setShowAddForm] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const scrollIntervalRef = useRef<number | null>(null);
  const [localHelpers, setLocalHelpers] = useState<Helper[]>(helpers);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingHelperId, setEditingHelperId] = useState<string | null>(null);
  const [editHelperFirstName, setEditHelperFirstName] = useState('');

  const handleAddHelper = useCallback(() => {
    // 苗字または名前のどちらかが入力されていればOK
    const lastName = newHelperLastName.trim();
    const firstName = newHelperFirstName.trim();
    const displayName = newHelperName.trim() || lastName; // nameが空なら苗字を使用

    if (!displayName) {
      alert('苗字を入力してください');
      return;
    }

    // 男性と女性を分ける
    const maleHelpers = localHelpers.filter(h => h.gender === 'male');
    const femaleHelpers = localHelpers.filter(h => h.gender === 'female');

    // 新しいIDと順番を計算
    const maxId = Math.max(...localHelpers.map(h => parseInt(h.id)), 0);
    const newHelper: Helper = {
      id: String(maxId + 1),
      name: displayName,
      lastName: lastName || undefined,
      firstName: firstName || undefined,
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

    setLocalHelpers(updatedHelpers);
    setHasChanges(true);
    setNewHelperName('');
    setNewHelperLastName('');
    setNewHelperFirstName('');
    setShowAddForm(false);
  }, [localHelpers, newHelperLastName, newHelperFirstName, newHelperName, newHelperGender]);

  // クリーンアップ: スクロールインターバルをクリア
  useEffect(() => {
    return () => {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
      }
    };
  }, []);

  const handleDragStart = useCallback((index: number) => {
    setDraggedIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();

    // 自動スクロール処理
    const container = listContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const scrollThreshold = 80; // スクロールを開始する境界の高さ
    const scrollSpeed = 10; // スクロール速度

    const mouseY = e.clientY - rect.top;

    // 既存のスクロールインターバルをクリア
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }

    // 上端に近い場合は上にスクロール
    if (mouseY < scrollThreshold && mouseY > 0) {
      scrollIntervalRef.current = window.setInterval(() => {
        container.scrollTop -= scrollSpeed;
      }, 16);
    }
    // 下端に近い場合は下にスクロール
    else if (mouseY > rect.height - scrollThreshold && mouseY < rect.height) {
      scrollIntervalRef.current = window.setInterval(() => {
        container.scrollTop += scrollSpeed;
      }, 16);
    }
  }, []);

  const handleDrop = useCallback((dropIndex: number) => {
    // スクロールインターバルをクリア
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }

    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      return;
    }

    const updatedHelpers = [...localHelpers];
    const [draggedHelper] = updatedHelpers.splice(draggedIndex, 1);
    updatedHelpers.splice(dropIndex, 0, draggedHelper);

    // orderを再設定
    const reorderedHelpers = updatedHelpers.map((h, idx) => ({ ...h, order: idx + 1 }));

    setLocalHelpers(reorderedHelpers);
    setHasChanges(true);
    setDraggedIndex(null);
  }, [draggedIndex, localHelpers]);

  const handleStartEdit = useCallback((helper: Helper) => {
    setEditingHelperId(helper.id);
    setEditHelperFirstName(helper.firstName || '');
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingHelperId) return;

    const helper = localHelpers.find(h => h.id === editingHelperId);
    if (!helper) return;

    const updatedHelpers = localHelpers.map(h =>
      h.id === editingHelperId
        ? {
            ...h,
            lastName: h.name, // 現在のnameを苗字として設定
            firstName: editHelperFirstName.trim() || undefined
          }
        : h
    );

    setLocalHelpers(updatedHelpers);
    setEditingHelperId(null);
    setEditHelperFirstName('');

    // 即座にFirestoreに保存
    setIsSaving(true);
    try {
      await onUpdate(updatedHelpers);
      alert('✅ 保存しました');
    } catch (error) {
      console.error('保存エラー:', error);
      alert('❌ 保存に失敗しました');
    } finally {
      setIsSaving(false);
      setHasChanges(false);
    }
  }, [editingHelperId, localHelpers, editHelperFirstName, onUpdate]);

  const handleCancelEdit = useCallback(() => {
    setEditingHelperId(null);
    setEditHelperFirstName('');
  }, []);

  const handleDeleteHelper = useCallback((helperId: string) => {
    if (!confirm('このヘルパーを削除してもよろしいですか？')) {
      return;
    }

    const updatedHelpers = localHelpers
      .filter(h => h.id !== helperId)
      .map((h, idx) => ({ ...h, order: idx + 1 }));

    setLocalHelpers(updatedHelpers);
    setHasChanges(true);
  }, [localHelpers]);

  const handleGenerateToken = useCallback((helperId: string) => {
    const updatedHelpers = localHelpers.map(h =>
      h.id === helperId
        ? { ...h, personalToken: generateToken() }
        : h
    );
    setLocalHelpers(updatedHelpers);
    setHasChanges(true);
  }, [localHelpers]);

  const handleCopyUrl = useCallback((token: string) => {
    const url = `${baseUrl}/personal/${token}`;
    navigator.clipboard.writeText(url);
    alert('URLをコピーしました！\n\n' + url);
  }, [baseUrl]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await onUpdate(localHelpers);
      setHasChanges(false);
      alert('保存しました！');
      setTimeout(() => {
        onClose();
      }, 300);
    } catch (error) {
      console.error('保存に失敗しました:', error);
      alert('保存に失敗しました。もう一度お試しください。');
    } finally {
      setIsSaving(false);
    }
  }, [localHelpers, onUpdate, onClose]);

  const handleClose = useCallback(() => {
    if (hasChanges) {
      if (confirm('保存されていない変更があります。破棄してもよろしいですか？')) {
        onClose();
      }
    } else {
      onClose();
    }
  }, [hasChanges, onClose]);

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        {/* ヘッダー */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold">ヘルパー管理</h1>
            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
                className={`px-6 py-3 rounded-lg font-bold text-lg ${
                  hasChanges && !isSaving
                    ? 'bg-green-500 text-white hover:bg-green-600'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isSaving ? '保存中...' : hasChanges ? '💾 保存する' : '保存済み'}
              </button>
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                ← シフト表に戻る
              </button>
            </div>
          </div>
        </div>

        {/* ヘルパーリスト */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">ヘルパー一覧</h2>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              {showAddForm ? '✕ 閉じる' : '➕ 新しいヘルパーを追加'}
            </button>
          </div>

          <p className="text-sm text-gray-600 mb-4">
            ドラッグ＆ドロップで順番を入れ替えられます
          </p>

          {/* ヘルパーリスト表示 */}
          <div ref={listContainerRef} className="space-y-2 max-h-[600px] overflow-y-auto">
            {localHelpers.map((helper, index) => {
              // 性別に応じた背景色
              const bgColor = helper.gender === 'male'
                ? 'bg-blue-50'
                : 'bg-pink-50';

              return (
                <div
                  key={helper.id}
                  className="border-2 rounded-lg transition-all"
                  style={{ borderColor: helper.gender === 'male' ? '#93c5fd' : '#f9a8d4' }}
                >
                  {/* ドラッグ可能なヘッダー部分 */}
                  <div
                    draggable={editingHelperId !== helper.id}
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(index)}
                    className={`flex items-center justify-between p-4 ${editingHelperId !== helper.id ? 'cursor-move' : ''} ${bgColor} ${
                      draggedIndex === index ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-4 flex-1">
                      {editingHelperId !== helper.id && <span className="text-2xl">☰</span>}
                      <span className="text-2xl">{helper.gender === 'male' ? '👨' : '👩'}</span>
                      <div className="flex-1">
                        {editingHelperId === helper.id ? (
                          <div className="space-y-3">
                            <div className="font-medium text-lg">{helper.name}</div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-600">苗字: {helper.name}</span>
                              <span className="text-sm text-gray-600">+</span>
                              <input
                                type="text"
                                value={editHelperFirstName}
                                onChange={(e) => setEditHelperFirstName(e.target.value)}
                                placeholder="名前を入力"
                                className="flex-1 px-3 py-2 border rounded text-sm"
                                autoFocus
                              />
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="font-medium text-lg">{helper.name}</div>
                            <div className="text-sm text-gray-600">
                              {helper.gender === 'male' ? '男性' : '女性'} · 順番: {helper.order}
                              {helper.lastName && helper.firstName && ` · ${helper.lastName}${helper.firstName}`}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {editingHelperId === helper.id ? (
                        <>
                          <button
                            onClick={handleSaveEdit}
                            disabled={isSaving}
                            className="px-3 py-1 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isSaving ? '保存中...' : '✓ 保存'}
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            disabled={isSaving}
                            className="px-3 py-1 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            ✕ キャンセル
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleStartEdit(helper)}
                            className="px-3 py-1 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            ✏️ 編集
                          </button>
                          <button
                            onClick={() => handleDeleteHelper(helper.id)}
                            className="px-3 py-1 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            🗑️ 削除
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* 個人シフト表URL部分 */}
                  <div className="p-4 bg-white border-t">
                    <div className="text-sm font-medium mb-2">📱 個人シフト表URL</div>
                    {helper.personalToken ? (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={`${baseUrl}/personal/${helper.personalToken}`}
                            readOnly
                            className="flex-1 px-3 py-2 text-sm border rounded bg-gray-50"
                          />
                          <button
                            onClick={() => handleCopyUrl(helper.personalToken!)}
                            className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm whitespace-nowrap"
                          >
                            📋 コピー
                          </button>
                        </div>
                        <button
                          onClick={() => handleGenerateToken(helper.id)}
                          className="text-xs text-gray-500 hover:text-gray-700 text-left"
                        >
                          🔄 URLを再生成
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleGenerateToken(helper.id)}
                        className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
                      >
                        ✨ URLを生成
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 新規追加フォーム */}
        {showAddForm && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold mb-4">新しいヘルパーを追加</h2>

            {/* フォーム */}
            <div className="space-y-6">
              <div>
                <label className="block text-lg font-medium mb-3">シフト表表示名（苗字のみでOK）</label>
                <input
                  type="text"
                  value={newHelperName}
                  onChange={(e) => setNewHelperName(e.target.value)}
                  placeholder="例: 田中"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddHelper()}
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-lg font-medium mb-3">苗字（経費照合用）</label>
                  <input
                    type="text"
                    value={newHelperLastName}
                    onChange={(e) => setNewHelperLastName(e.target.value)}
                    placeholder="例: 田中"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddHelper()}
                  />
                </div>
                <div>
                  <label className="block text-lg font-medium mb-3">名前（経費照合用）</label>
                  <input
                    type="text"
                    value={newHelperFirstName}
                    onChange={(e) => setNewHelperFirstName(e.target.value)}
                    placeholder="例: 太郎"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddHelper()}
                  />
                </div>
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
                onClick={() => {
                  setShowAddForm(false);
                  setNewHelperName('');
                }}
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
        )}
      </div>
    </div>
  );
});
