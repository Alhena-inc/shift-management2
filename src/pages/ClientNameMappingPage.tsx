import React, { useState, useEffect, useMemo } from 'react';
import type { CareClient, ClientNameMapping } from '../types';
import { loadCareClients, loadClientNameMappings, saveClientNameMapping, deleteClientNameMapping } from '../services/dataService';
import { supabase } from '../lib/supabase';

const ClientNameMappingPage: React.FC = () => {
  const [careClients, setCareClients] = useState<CareClient[]>([]);
  const [mappings, setMappings] = useState<ClientNameMapping[]>([]);
  const [shiftClientNames, setShiftClientNames] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'unmapped' | 'mapped'>('all');
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // データ読み込み
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [clients, existingMappings, shiftNames] = await Promise.all([
          loadCareClients(),
          loadClientNameMappings(),
          loadDistinctShiftClientNames(),
        ]);
        setCareClients(clients.filter(c => !c.deleted));
        setMappings(existingMappings);
        setShiftClientNames(shiftNames);
      } catch (error) {
        console.error('データ読み込みエラー:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  // シフトテーブルからユニークな利用者名を取得
  const loadDistinctShiftClientNames = async (): Promise<string[]> => {
    try {
      const { data, error } = await supabase
        .from('shifts')
        .select('client_name')
        .eq('deleted', false)
        .not('client_name', 'eq', '');

      if (error) throw error;

      const uniqueNames = [...new Set((data || []).map((r: any) => r.client_name).filter(Boolean))];
      return uniqueNames.sort((a, b) => a.localeCompare(b, 'ja'));
    } catch (error) {
      console.error('シフト利用者名取得エラー:', error);
      return [];
    }
  };

  // マッピング状態のマップ (shiftClientName → mapping)
  const mappingMap = useMemo(() => {
    const map = new Map<string, ClientNameMapping>();
    for (const m of mappings) {
      map.set(m.shiftClientName, m);
    }
    return map;
  }, [mappings]);

  // フィルタリングされたリスト
  const filteredNames = useMemo(() => {
    let names = shiftClientNames;

    // 検索フィルタ
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      names = names.filter(name => {
        if (name.toLowerCase().includes(query)) return true;
        const mapping = mappingMap.get(name);
        if (mapping) {
          const client = careClients.find(c => c.id === mapping.usersCareId);
          if (client && client.name.toLowerCase().includes(query)) return true;
        }
        return false;
      });
    }

    // マッピング状態フィルタ
    if (filterMode === 'unmapped') {
      names = names.filter(name => !mappingMap.has(name));
    } else if (filterMode === 'mapped') {
      names = names.filter(name => mappingMap.has(name));
    }

    return names;
  }, [shiftClientNames, searchQuery, filterMode, mappingMap, careClients]);

  // マッピングを保存
  const handleSaveMapping = async (shiftClientName: string, usersCareId: string) => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const existing = mappingMap.get(shiftClientName);

      if (usersCareId === '') {
        // 紐付け解除
        if (existing) {
          await deleteClientNameMapping(existing.id);
          setMappings(prev => prev.filter(m => m.id !== existing.id));
          setSaveMessage({ type: 'success', text: `「${shiftClientName}」の紐付けを解除しました` });
        }
      } else {
        // 紐付け設定
        const mapping: ClientNameMapping = {
          id: existing?.id || crypto.randomUUID(),
          shiftClientName,
          usersCareId,
        };
        await saveClientNameMapping(mapping);
        setMappings(prev => {
          const filtered = prev.filter(m => m.shiftClientName !== shiftClientName);
          return [...filtered, mapping];
        });
        const client = careClients.find(c => c.id === usersCareId);
        setSaveMessage({ type: 'success', text: `「${shiftClientName}」を「${client?.name || ''}」に紐付けました` });
      }
    } catch (error) {
      console.error('マッピング保存エラー:', error);
      setSaveMessage({ type: 'error', text: '保存に失敗しました' });
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  // 統計
  const mappedCount = shiftClientNames.filter(n => mappingMap.has(n)).length;
  const unmappedCount = shiftClientNames.length - mappedCount;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* ヘッダー */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-4">
              <button
                onClick={() => window.location.href = '/'}
                className="p-2 sm:px-4 sm:py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-2 text-gray-700"
              >
                <span className="hidden sm:inline">&#x1F3E0; ホームに戻る</span>
                <span className="sm:hidden text-lg">&#x1F3E0;</span>
              </button>
              <h1 className="text-lg sm:text-2xl font-bold text-gray-800">利用者名 紐付け設定</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        {/* 説明 */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-blue-600 text-xl mt-0.5">info</span>
            <div>
              <h3 className="text-sm font-semibold text-blue-800 mb-1">シフト表の利用者名と利用者マスタの紐付け</h3>
              <p className="text-sm text-blue-700">
                シフト表に入力された利用者名を、利用者管理に登録されている利用者データに紐付けます。
                紐付けることで、書類生成やケア記録の自動連携が可能になります。
              </p>
            </div>
          </div>
        </div>

        {/* 統計 */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">シフト上の利用者名</p>
            <p className="text-2xl font-bold text-gray-900">{shiftClientNames.length}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">紐付け済み</p>
            <p className="text-2xl font-bold text-green-600">{mappedCount}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">未紐付け</p>
            <p className="text-2xl font-bold text-orange-600">{unmappedCount}</p>
          </div>
        </div>

        {/* フィルタ＆検索 */}
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm mb-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">search</span>
                <input
                  type="text"
                  placeholder="利用者名で検索..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              {(['all', 'unmapped', 'mapped'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setFilterMode(mode)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filterMode === mode
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {mode === 'all' ? 'すべて' : mode === 'unmapped' ? '未紐付け' : '紐付け済み'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 保存メッセージ */}
        {saveMessage && (
          <div className={`mb-4 p-3 rounded-lg text-sm font-medium ${
            saveMessage.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {saveMessage.text}
          </div>
        )}

        {/* マッピングリスト */}
        {isLoading ? (
          <div className="bg-white rounded-xl p-12 border border-gray-100 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            <span className="ml-3 text-gray-500">読み込み中...</span>
          </div>
        ) : filteredNames.length === 0 ? (
          <div className="bg-white rounded-xl p-12 border border-gray-100 text-center">
            <span className="material-symbols-outlined text-gray-300 text-5xl mb-3">link_off</span>
            <p className="text-gray-500">
              {searchQuery ? '検索条件に一致する利用者名がありません' : 'シフト表に利用者名が登録されていません'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    シフト上の利用者名
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    状態
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    紐付け先（利用者マスタ）
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredNames.map(name => {
                  const mapping = mappingMap.get(name);
                  const isMapped = !!mapping;

                  return (
                    <MappingRow
                      key={name}
                      shiftClientName={name}
                      currentMapping={mapping}
                      careClients={careClients}
                      isMapped={isMapped}
                      isSaving={isSaving}
                      onSave={handleSaveMapping}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
};

// 個別行コンポーネント
interface MappingRowProps {
  shiftClientName: string;
  currentMapping: ClientNameMapping | undefined;
  careClients: CareClient[];
  isMapped: boolean;
  isSaving: boolean;
  onSave: (shiftClientName: string, usersCareId: string) => Promise<void>;
}

const MappingRow: React.FC<MappingRowProps> = ({
  shiftClientName,
  currentMapping,
  careClients,
  isMapped,
  isSaving,
  onSave,
}) => {
  const [selectedId, setSelectedId] = useState(currentMapping?.usersCareId || '');
  const [isEditing, setIsEditing] = useState(false);

  // マッピングが外部から更新された場合に同期
  useEffect(() => {
    setSelectedId(currentMapping?.usersCareId || '');
  }, [currentMapping?.usersCareId]);

  const hasChanged = selectedId !== (currentMapping?.usersCareId || '');

  const handleSave = async () => {
    await onSave(shiftClientName, selectedId);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setSelectedId(currentMapping?.usersCareId || '');
    setIsEditing(false);
  };

  const mappedClient = isMapped
    ? careClients.find(c => c.id === currentMapping?.usersCareId)
    : undefined;

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      {/* シフト上の利用者名 */}
      <td className="px-4 py-3">
        <span className="text-sm font-medium text-gray-900">{shiftClientName}</span>
      </td>

      {/* 状態 */}
      <td className="px-4 py-3">
        {isMapped ? (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <span className="material-symbols-outlined text-xs">check_circle</span>
            紐付け済み
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
            <span className="material-symbols-outlined text-xs">warning</span>
            未紐付け
          </span>
        )}
      </td>

      {/* 紐付け先 */}
      <td className="px-4 py-3">
        {isEditing || !isMapped ? (
          <div className="flex items-center gap-2">
            <select
              value={selectedId}
              onChange={e => {
                setSelectedId(e.target.value);
                setIsEditing(true);
              }}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={isSaving}
            >
              <option value="">-- 利用者を選択 --</option>
              {careClients.map(client => (
                <option key={client.id} value={client.id}>
                  {client.name}{client.nameKana ? ` (${client.nameKana})` : ''}
                </option>
              ))}
            </select>
            {hasChanged && (
              <div className="flex gap-1">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  保存
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors"
                >
                  取消
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-green-600 text-lg">person</span>
              <span className="text-sm text-gray-900">{mappedClient?.name || '（削除済み）'}</span>
              {mappedClient?.nameKana && (
                <span className="text-xs text-gray-500">({mappedClient.nameKana})</span>
              )}
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setIsEditing(true)}
                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="変更"
              >
                <span className="material-symbols-outlined text-lg">edit</span>
              </button>
              <button
                onClick={() => onSave(shiftClientName, '')}
                disabled={isSaving}
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="紐付け解除"
              >
                <span className="material-symbols-outlined text-lg">link_off</span>
              </button>
            </div>
          </div>
        )}
      </td>
    </tr>
  );
};

export default ClientNameMappingPage;
