import React, { useState, useRef } from 'react';
import type { ShogaiDocument, ShogaiDocType } from '../../types';
import { saveShogaiDocument, deleteShogaiDocument, uploadShogaiDocFile } from '../../services/dataService';

interface Props {
  careClientId: string;
  docType: ShogaiDocType;
  title: string;
  documents: ShogaiDocument[];
  onUpdate: (items: ShogaiDocument[]) => void;
  onBack: () => void;
}

const formatFileSize = (bytes: number): string => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

const formatDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
};

const getFileIcon = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['pdf'].includes(ext)) return '📄';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return '🖼️';
  if (['doc', 'docx'].includes(ext)) return '📝';
  if (['xls', 'xlsx'].includes(ext)) return '📊';
  return '📎';
};

const ShogaiDocumentList: React.FC<Props> = ({ careClientId, docType, title, documents, onUpdate, onBack }) => {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const { url } = await uploadShogaiDocFile(careClientId, docType, file);
      const newDoc: ShogaiDocument = {
        id: '',
        careClientId,
        docType,
        fileName: file.name,
        fileUrl: url,
        fileSize: file.size,
        notes: '',
        sortOrder: documents.length,
      };
      const saved = await saveShogaiDocument(newDoc);
      onUpdate([...documents, saved]);
    } catch (error) {
      console.error('アップロードエラー:', error);
      alert('ファイルのアップロードに失敗しました');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (index: number) => {
    const item = documents[index];
    if (!confirm(`「${item.fileName}」を削除しますか？`)) return;
    try {
      await deleteShogaiDocument(item.id);
      onUpdate(documents.filter(d => d.id !== item.id));
    } catch (error) {
      console.error('削除エラー:', error);
      alert('削除に失敗しました');
    }
  };

  const handleView = (item: ShogaiDocument) => {
    if (item.fileUrl) {
      window.open(item.fileUrl, '_blank');
    }
  };

  return (
    <div>
      <button onClick={onBack} className="mb-4 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-gray-700">← 戻る</button>

      <div className="border border-gray-300 rounded-lg p-4 mb-4">
        <h3 className="font-bold text-gray-800">{title}</h3>
      </div>

      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <div className="divide-y divide-gray-200">
          {/* 追加ボタン */}
          <div className="px-4 py-3 flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileUpload}
              className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-4 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors font-medium disabled:opacity-50"
            >
              {uploading ? 'アップロード中...' : 'ファイルを追加'}
            </button>
          </div>

          {/* ドキュメントリスト */}
          {documents.length === 0 ? (
            <div className="px-4 py-6 text-center text-gray-400 text-sm">
              まだファイルがありません
            </div>
          ) : (
            documents.map((item, index) => (
              <div key={item.id} className="flex items-center px-4 py-3 hover:bg-gray-50 gap-3">
                <span className="text-lg shrink-0">{getFileIcon(item.fileName)}</span>
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => handleView(item)}
                    className="text-sm text-blue-600 hover:text-blue-800 hover:underline truncate block text-left w-full"
                    title={item.fileName}
                  >
                    {item.fileName}
                  </button>
                  <div className="flex gap-3 text-xs text-gray-400 mt-0.5">
                    {item.fileSize > 0 && <span>{formatFileSize(item.fileSize)}</span>}
                    {item.createdAt && <span>{formatDate(item.createdAt)}</span>}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(index)}
                  className="text-red-400 hover:text-red-600 p-1 shrink-0"
                  title="削除"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ShogaiDocumentList;
