import { useState, useRef, useEffect, useCallback, memo } from 'react';
import type { Helper } from '../types';
import { getGoogleAccessToken } from '../services/googleAuthService';
import { addHelperColumn } from '../services/googleSheetsApi';
import { softDeleteHelper } from '../services/firestoreService';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ランダムトークン生成関数（10文字）
const generateToken = (): string => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 10; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
};

interface SortableHelperRowProps {
  helper: Helper;
  isEditing: boolean;
  editFirstName: string;
  baseUrl: string;
  isSaving: boolean;
  onStartEdit: (helper: Helper) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
  onCopyUrl: (token: string) => void;
  onGenerateToken: (id: string) => void;
  onEditChange: (value: string) => void;
}

const SortableHelperRow = ({
  helper,
  isEditing,
  editFirstName,
  baseUrl,
  isSaving,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onCopyUrl,
  onGenerateToken,
  onEditChange
}: SortableHelperRowProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: helper.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
    position: 'relative' as const,
  };

  const bgColor = helper.gender === 'male' ? 'bg-blue-50' : 'bg-pink-50';
  const borderColor = helper.gender === 'male' ? '#93c5fd' : '#f9a8d4';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border-2 rounded-lg transition-all mb-2 bg-white"
    >
      <div
        className="border-b rounded-t-lg transition-all"
        style={{ borderColor }}
      >
        <div className={`flex items-center justify-between p-4 ${bgColor} rounded-t-lg`}>
          <div className="flex items-center gap-4 flex-1">
            {/* ドラッグハンドル */}
            {!isEditing && (
              <div
                {...attributes}
                {...listeners}
                className="cursor-move p-2 hover:bg-black/5 rounded touch-none"
              >
                <span className="text-2xl text-gray-500">☰</span>
              </div>
            )}

            <span className="text-2xl">{helper.gender === 'male' ? '👨' : '👩'}</span>

            <div className="flex-1">
              {isEditing ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-1.5 py-0.5 bg-gray-600 text-white rounded opacity-60">
                      #{helper.order}
                    </span>
                    <div className="font-medium text-lg">{helper.name}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">苗字: {helper.name}</span>
                    <span className="text-sm text-gray-600">+</span>
                    <input
                      type="text"
                      value={editFirstName}
                      onChange={(e) => onEditChange(e.target.value)}
                      placeholder="名前を入力"
                      className="flex-1 px-3 py-2 border rounded text-sm"
                      autoFocus
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-1.5 py-0.5 bg-gray-600 text-white rounded opacity-60">
                      #{helper.order}
                    </span>
                    <div className="font-medium text-lg">{helper.name}</div>
                  </div>
                  <div className="text-sm text-gray-600">
                    {helper.gender === 'male' ? '男性' : '女性'}
                    {helper.lastName && helper.firstName && ` · ${helper.lastName}${helper.firstName}`}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={onSaveEdit}
                  disabled={isSaving}
                  className="px-3 py-1 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm disabled:opacity-50"
                >
                  {isSaving ? '保存中...' : '✓ 保存'}
                </button>
                <button
                  onClick={onCancelEdit}
                  disabled={isSaving}
                  className="px-3 py-1 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm disabled:opacity-50"
                >
                  ✕ キャンセル
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => onStartEdit(helper)}
                  className="px-3 py-1 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  ✏️ 編集
                </button>
                <button
                  onClick={() => onDelete(helper.id)}
                  className="px-3 py-1 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  🗑️ 削除
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 個人シフト表URL部分 */}
      <div className="p-4 bg-white rounded-b-lg">
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
                onClick={() => onCopyUrl(helper.personalToken!)}
                className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm whitespace-nowrap"
              >
                📋 コピー
              </button>
            </div>
            <button
              onClick={() => onGenerateToken(helper.id)}
              className="text-xs text-gray-500 hover:text-gray-700 text-left"
            >
              🔄 URLを再生成
            </button>
          </div>
        ) : (
          <button
            onClick={() => onGenerateToken(helper.id)}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
          >
            ✨ URLを生成
          </button>
        )}
      </div>
    </div>
  );
};

interface Props {
  helpers: Helper[];
  onUpdate: (helpers: Helper[]) => void;
  onClose: () => void;
}

export const HelperManager = memo(function HelperManager({ helpers, onUpdate, onClose }: Props) {
  const isDevelopment = import.meta.env.DEV;
  const baseUrl = isDevelopment ? window.location.origin : (import.meta.env.VITE_APP_URL || window.location.origin);

  const [newHelperName, setNewHelperName] = useState('');
  const [newHelperLastName, setNewHelperLastName] = useState('');
  const [newHelperFirstName, setNewHelperFirstName] = useState('');
  const [newHelperGender, setNewHelperGender] = useState<'male' | 'female'>('male');
  const [showAddForm, setShowAddForm] = useState(false);
  const [localHelpers, setLocalHelpers] = useState<Helper[]>(helpers);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingHelperId, setEditingHelperId] = useState<string | null>(null);
  const [editHelperFirstName, setEditHelperFirstName] = useState('');

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = localHelpers.findIndex((item) => item.id === active.id);
      const newIndex = localHelpers.findIndex((item) => item.id === over?.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newHelpers = arrayMove(localHelpers, oldIndex, newIndex);

        // orderを再設定
        const reorderedHelpers = newHelpers.map((h, idx) => ({ ...h, order: idx + 1 }));

        setLocalHelpers(reorderedHelpers);
        setHasChanges(false);

        // 即座に保存
        setIsSaving(true);
        try {
          console.log('💾 並び替えを保存中...');
          await onUpdate(reorderedHelpers);
          console.log('✅ 並び替えを保存しました');
        } catch (error) {
          console.error('❌ 保存エラー:', error);
          alert('並び替えの保存に失敗しました');
          setLocalHelpers(localHelpers); // Revert
        } finally {
          setIsSaving(false);
        }
      }
    }
  }, [localHelpers, onUpdate]);

  const handleAddHelper = useCallback(async () => {
    const lastName = newHelperLastName.trim();
    const firstName = newHelperFirstName.trim();
    const displayName = newHelperName.trim() || lastName;

    if (!displayName) {
      alert('苗字を入力してください');
      return;
    }

    const maleHelpers = localHelpers.filter(h => h.gender === 'male');
    const femaleHelpers = localHelpers.filter(h => h.gender === 'female');

    const maxId = Math.max(...localHelpers.map(h => parseInt(h.id)), 0);
    const newHelper: Helper = {
      id: String(maxId + 1),
      name: displayName,
      ...(lastName && { lastName }),
      ...(firstName && { firstName }),
      gender: newHelperGender,
      order: 0,
      personalToken: generateToken(),
    };

    let updatedHelpers: Helper[];
    if (newHelperGender === 'male') {
      updatedHelpers = [...maleHelpers, newHelper, ...femaleHelpers];
    } else {
      updatedHelpers = [...maleHelpers, ...femaleHelpers, newHelper];
    }

    updatedHelpers = updatedHelpers.map((h, idx) => ({ ...h, order: idx + 1 }));

    setIsSaving(true);
    try {
      await onUpdate(updatedHelpers);
      await new Promise(resolve => setTimeout(resolve, 500));

      try {
        const accessToken = await getGoogleAccessToken();
        await addHelperColumn(displayName, accessToken);
      } catch (error) {
        console.error('Spreadsheet error:', error);
        // Continue even if spreadsheet fails
      }

      setLocalHelpers(updatedHelpers);
      setNewHelperName('');
      setNewHelperLastName('');
      setNewHelperFirstName('');
      setNewHelperGender('male');
      setShowAddForm(false);
      alert(`✅ ${displayName}さんを保存しました`);
    } catch (error) {
      console.error('Add helper error:', error);
      alert(`追加に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  }, [localHelpers, newHelperLastName, newHelperFirstName, newHelperName, newHelperGender, onUpdate]);

  const handleStartEdit = useCallback((helper: Helper) => {
    setEditingHelperId(helper.id);
    setEditHelperFirstName(helper.firstName || '');
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingHelperId) return;

    const helper = localHelpers.find(h => h.id === editingHelperId);
    if (!helper) return;

    const updatedHelpers = localHelpers.map(h => {
      if (h.id === editingHelperId) {
        const trimmedFirstName = editHelperFirstName.trim();
        return {
          ...h,
          lastName: h.name,
          ...(trimmedFirstName && { firstName: trimmedFirstName })
        };
      }
      return h;
    });

    setLocalHelpers(updatedHelpers);
    setEditingHelperId(null);
    setEditHelperFirstName('');

    setIsSaving(true);
    try {
      await onUpdate(updatedHelpers);
      alert('✅ 保存しました');
    } catch (error) {
      console.error('Save error:', error);
      alert('保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  }, [editingHelperId, localHelpers, editHelperFirstName, onUpdate]);

  const handleCancelEdit = useCallback(() => {
    setEditingHelperId(null);
    setEditHelperFirstName('');
  }, []);

  const handleDeleteHelper = useCallback(async (helperId: string) => {
    const helperName = localHelpers.find(h => h.id === helperId)?.name || '';

    if (!confirm(`${helperName}さんを削除してもよろしいですか？`)) {
      return;
    }

    const updatedHelpers = localHelpers
      .filter(h => h.id !== helperId)
      .map((h, idx) => ({ ...h, order: idx + 1 }));

    setLocalHelpers(updatedHelpers);
    setIsSaving(true);
    try {
      await softDeleteHelper(helperId);
      await onUpdate(updatedHelpers);
      alert(`✅ ${helperName}さんを削除しました`);
    } catch (error) {
      console.error('Delete error:', error);
      alert('削除に失敗しました');
      setLocalHelpers(localHelpers);
    } finally {
      setIsSaving(false);
    }
  }, [localHelpers, onUpdate]);

  const handleGenerateToken = useCallback(async (helperId: string) => {
    const helper = localHelpers.find(h => h.id === helperId);
    if (helper?.personalToken) {
      if (!confirm('URLを再生成すると、これまでのURLは使えなくなります。本当によろしいですか？')) {
        return;
      }
    }

    const updatedHelpers = localHelpers.map(h =>
      h.id === helperId
        ? { ...h, personalToken: generateToken() }
        : h
    );
    setLocalHelpers(updatedHelpers);

    setIsSaving(true);
    try {
      await onUpdate(updatedHelpers);
    } catch (error) {
      console.error('Token gen error:', error);
      alert('URL生成の保存に失敗しました');
      setLocalHelpers(localHelpers);
    } finally {
      setIsSaving(false);
    }
  }, [localHelpers, onUpdate]);

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
      alert('保存に失敗しました');
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
                className={`px-6 py-3 rounded-lg font-bold text-lg ${hasChanges && !isSaving
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
            ドラッグ＆ドロップで順番を入れ替えられます（≡ アイコンをドラッグ）
          </p>

          <div className="max-h-[600px] overflow-y-auto pr-2">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={localHelpers.filter(h => !h.deleted).map(h => h.id)}
                strategy={verticalListSortingStrategy}
              >
                {localHelpers
                  .filter(helper => !helper.deleted)
                  .map((helper) => (
                    <SortableHelperRow
                      key={helper.id}
                      helper={helper}
                      isEditing={editingHelperId === helper.id}
                      editFirstName={editHelperFirstName}
                      baseUrl={baseUrl}
                      isSaving={isSaving}
                      onStartEdit={handleStartEdit}
                      onSaveEdit={handleSaveEdit}
                      onCancelEdit={handleCancelEdit}
                      onDelete={handleDeleteHelper}
                      onCopyUrl={handleCopyUrl}
                      onGenerateToken={handleGenerateToken}
                      onEditChange={setEditHelperFirstName}
                    />
                  ))}
              </SortableContext>
            </DndContext>
          </div>
        </div>

        {/* 新規追加フォーム */}
        {showAddForm && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold mb-4">新しいヘルパーを追加</h2>
            <div className="space-y-6">
              <div>
                <label className="block text-lg font-medium mb-3">シフト表表示名（苗字のみでOK）</label>
                <input
                  type="text"
                  value={newHelperName}
                  onChange={(e) => setNewHelperName(e.target.value)}
                  placeholder="例: 田中"
                  className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-lg text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-lg text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-lg font-medium mb-3">名前（経費照合用）</label>
                  <input
                    type="text"
                    value={newHelperFirstName}
                    onChange={(e) => setNewHelperFirstName(e.target.value)}
                    placeholder="例: 太郎"
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-lg text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
