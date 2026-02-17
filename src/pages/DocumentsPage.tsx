import React, { useState, useCallback, useRef, useEffect } from 'react';
import { loadCareClients, loadShogaiDocuments, saveShogaiDocument, deleteShogaiDocument, uploadShogaiDocFile } from '../services/dataService';
import type { CareClient, ShogaiDocument } from '../types';

const DocumentsPage: React.FC = () => {
  const [careClients, setCareClients] = useState<CareClient[]>([]);
  const [assessmentDocs, setAssessmentDocs] = useState<Record<string, ShogaiDocument[]>>({});
  const [loading, setLoading] = useState(true);
  const [uploadingClient, setUploadingClient] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uploadFileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const clients = (await loadCareClients()).filter(c => !c.deleted);
      setCareClients(clients);

      const docsMap: Record<string, ShogaiDocument[]> = {};
      await Promise.all(
        clients.map(async (client) => {
          try {
            docsMap[client.id] = await loadShogaiDocuments(client.id, 'assessment');
          } catch {
            docsMap[client.id] = [];
          }
        })
      );
      setAssessmentDocs(docsMap);
    } catch (err) {
      console.error('データ読み込みエラー:', err);
      setError('データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpload = useCallback(async (clientId: string, file: File) => {
    setUploadingClient(clientId);
    try {
      const { url } = await uploadShogaiDocFile(clientId, 'assessment', file);
      const newDoc: ShogaiDocument = {
        id: '',
        careClientId: clientId,
        docType: 'assessment',
        fileName: file.name,
        fileUrl: url,
        fileSize: file.size,
        notes: '',
        sortOrder: (assessmentDocs[clientId] || []).length,
      };
      const saved = await saveShogaiDocument(newDoc);
      setAssessmentDocs(prev => ({
        ...prev,
        [clientId]: [...(prev[clientId] || []), saved],
      }));
    } catch (err) {
      console.error('アップロードエラー:', err);
      alert('ファイルのアップロードに失敗しました');
    } finally {
      setUploadingClient(null);
    }
  }, [assessmentDocs]);

  const handleDelete = useCallback(async (clientId: string, doc: ShogaiDocument) => {
    if (!confirm(`「${doc.fileName}」を削除しますか？`)) return;
    try {
      await deleteShogaiDocument(doc.id);
      setAssessmentDocs(prev => ({
        ...prev,
        [clientId]: (prev[clientId] || []).filter(d => d.id !== doc.id),
      }));
    } catch (err) {
      console.error('削除エラー:', err);
      alert('削除に失敗しました');
    }
  }, []);

  const totalFiles = Object.values(assessmentDocs).reduce((sum, docs) => sum + docs.length, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.location.href = '/'}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="ホームに戻る"
            >
              <span className="material-symbols-outlined text-xl">arrow_back</span>
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-indigo-100 rounded-lg flex items-center justify-center">
                <span className="material-symbols-outlined text-indigo-600 text-xl">description</span>
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 leading-tight">運営指導書類</h1>
                <p className="text-xs text-gray-500">書類の管理・アップロード</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-5">
        {/* エラー表示 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 mb-5 flex items-start gap-2">
            <span className="material-symbols-outlined text-red-500 text-lg mt-0.5">error</span>
            <span className="text-red-700 text-sm flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 p-0.5">
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        )}

        {/* アセスメントセクション */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* セクションヘッダー */}
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-teal-100 rounded-lg flex items-center justify-center">
                <span className="material-symbols-outlined text-teal-600 text-xl">assignment</span>
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">アセスメント</h2>
                <p className="text-xs text-gray-500 mt-0.5">利用者ごとにアセスメントをアップロード</p>
              </div>
            </div>
            <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full font-medium">
              全{totalFiles}件
            </span>
          </div>

          {/* 利用者一覧 */}
          <div className="divide-y divide-gray-100">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
                <span className="animate-spin material-symbols-outlined">progress_activity</span>
                読み込み中...
              </div>
            ) : careClients.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm">利用者が登録されていません</div>
            ) : (
              careClients.map(client => {
                const clientDocs = assessmentDocs[client.id] || [];
                const isUploading = uploadingClient === client.id;
                return (
                  <div key={client.id} className="px-5 py-3.5">
                    {/* 利用者行 */}
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-gray-500 text-base">person</span>
                      </div>
                      <span className="text-sm font-medium text-gray-800 flex-1 min-w-0 truncate">{client.name}</span>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {clientDocs.length > 0 ? `${clientDocs.length}件` : '0件'}
                      </span>
                      <div className="flex-shrink-0">
                        <input
                          ref={el => { uploadFileRefs.current[client.id] = el; }}
                          type="file"
                          className="hidden"
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) await handleUpload(client.id, file);
                            if (uploadFileRefs.current[client.id]) uploadFileRefs.current[client.id]!.value = '';
                          }}
                        />
                        <button
                          onClick={() => uploadFileRefs.current[client.id]?.click()}
                          disabled={isUploading}
                          className="px-3 py-1.5 text-xs bg-teal-50 text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors font-medium disabled:opacity-50 flex items-center gap-1"
                        >
                          {isUploading ? (
                            <>
                              <span className="animate-spin material-symbols-outlined text-xs">progress_activity</span>
                              アップロード中
                            </>
                          ) : (
                            <>
                              <span className="material-symbols-outlined text-xs">add</span>
                              ファイルを追加
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* ファイル一覧 */}
                    {clientDocs.length > 0 && (
                      <div className="ml-11 mt-2 space-y-1">
                        {clientDocs.map(doc => (
                          <div key={doc.id} className="flex items-center gap-2 group px-2.5 py-1.5 rounded-lg hover:bg-gray-50">
                            <span className="text-sm flex-shrink-0">
                              {doc.fileName.endsWith('.pdf') ? '📄' : doc.fileName.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? '🖼️' : '📎'}
                            </span>
                            <button
                              onClick={() => doc.fileUrl && window.open(doc.fileUrl, '_blank')}
                              className="text-xs text-blue-600 hover:text-blue-800 hover:underline truncate text-left flex-1 min-w-0"
                              title={doc.fileName}
                            >
                              {doc.fileName}
                            </button>
                            {doc.fileSize > 0 && (
                              <span className="text-[10px] text-gray-400 flex-shrink-0">
                                {doc.fileSize < 1024 * 1024
                                  ? `${(doc.fileSize / 1024).toFixed(0)}KB`
                                  : `${(doc.fileSize / (1024 * 1024)).toFixed(1)}MB`}
                              </span>
                            )}
                            <button
                              onClick={() => handleDelete(client.id, doc)}
                              className="text-red-300 hover:text-red-500 p-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="削除"
                            >
                              <span className="material-symbols-outlined text-sm">delete</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default DocumentsPage;
