import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { subscribeToHelpers } from '../services/dataService';
import type { Helper as HelperType } from '../types';

interface PermissionManagerProps {
  onClose: () => void;
}

export const PermissionManager: React.FC<PermissionManagerProps> = ({ onClose }) => {
  const [helpers, setHelpers] = useState<HelperType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  // ヘルパーデータのリアルタイム監視（HelperManagementPageと同じ方式）
  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToHelpers((updatedHelpers) => {
      if (updatedHelpers !== null) {
        // 削除済みヘルパーを除外して、order順にソート
        const filteredHelpers = updatedHelpers
          .filter(helper => !helper.deleted)
          .sort((a, b) => (a.order || 0) - (b.order || 0));

        setHelpers(filteredHelpers);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 権限を更新
  const handleRoleChange = async (helperId: string, newRole: 'admin' | 'staff') => {
    setSaving(helperId);

    try {
      // Supabaseのhelpersテーブルを更新
      const query = supabase.from('helpers');
      // @ts-expect-error Database型定義が不完全なため
      const { error: updateError } = await query.update({ role: newRole }).eq('id', helperId);

      if (updateError) throw updateError;

      // ローカル状態を更新
      setHelpers(prev => prev.map(helper =>
        helper.id === helperId ? { ...helper, role: newRole } : helper
      ));

      console.log(`✅ ${helperId}の権限を${newRole}に更新しました`);
    } catch (error) {
      console.error('権限更新エラー:', error);
      alert('権限の更新に失敗しました');
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-center mt-4">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* ヘッダー */}
        <div className="flex justify-between items-center p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">🔐 権限管理</h2>
            <p className="text-sm text-gray-600 mt-1">
              各ヘルパーの権限を設定できます（管理者のみ）
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 権限説明 */}
        <div className="p-4 bg-blue-50 border-b border-blue-100">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 bg-red-100 text-red-800 text-xs font-medium rounded-full border border-red-200">
                  管理者
                </span>
                <span className="text-sm text-gray-700">全ての機能にアクセス可能</span>
              </div>
              <p className="text-xs text-gray-600">
                ヘルパー管理、利用者管理、交通費・経費、バックアップ、データ削除など
              </p>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs font-medium rounded-full border border-blue-200">
                  スタッフ
                </span>
                <span className="text-sm text-gray-700">基本機能のみ</span>
              </div>
              <p className="text-xs text-gray-600">
                シフト表閲覧、自分の給与明細、休み希望の登録
              </p>
            </div>
          </div>
        </div>

        {/* ヘルパー一覧 */}
        <div className="flex-1 overflow-y-auto p-6">
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="text-left p-3 font-medium text-gray-700">名前</th>
                <th className="text-left p-3 font-medium text-gray-700">メールアドレス</th>
                <th className="text-center p-3 font-medium text-gray-700">現在の権限</th>
                <th className="text-center p-3 font-medium text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {helpers.map((helper) => {
                const isSpecialAdmin = helper.email === 'info@alhena.co.jp';
                const currentRole = isSpecialAdmin ? 'admin' : (helper.role || 'staff');

                return (
                  <tr key={helper.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-gray-900">{helper.name}</div>
                        {helper.employmentType === 'fulltime' && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">正社員</span>
                        )}
                        {helper.employmentType === 'parttime' && (
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">パート</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="text-sm text-gray-600">
                        {helper.email || '未設定'}
                        {isSpecialAdmin && (
                          <span className="ml-2 text-xs text-red-600">(システム管理者)</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      {currentRole === 'admin' ? (
                        <span className="px-3 py-1 bg-red-100 text-red-800 text-sm font-medium rounded-full border border-red-200">
                          管理者
                        </span>
                      ) : (
                        <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full border border-blue-200">
                          スタッフ
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {isSpecialAdmin ? (
                        <span className="text-xs text-gray-500">変更不可</span>
                      ) : saving === helper.id ? (
                        <div className="flex justify-center">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                        </div>
                      ) : (
                        <select
                          value={currentRole}
                          onChange={(e) => handleRoleChange(helper.id, e.target.value as 'admin' | 'staff')}
                          className="px-3 py-1 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="staff">スタッフ</option>
                          <option value="admin">管理者</option>
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {helpers.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              ヘルパーが登録されていません
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="p-6 border-t bg-gray-50">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-600">
              {helpers.filter(h => h.role === 'admin' || h.email === 'info@alhena.co.jp').length} 人の管理者 /
              {' '}{helpers.length} 人のヘルパー
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};