import React from 'react';
import DocumentScheduleDashboard from '../components/DocumentScheduleDashboard';

const DocumentSchedulePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => window.location.href = '/'}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title="ホームに戻る"
              >
                <span className="material-symbols-outlined">arrow_back</span>
              </button>
              <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                <span className="material-symbols-outlined text-indigo-600 text-2xl">
                  event_note
                </span>
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">書類スケジュール</h1>
                <p className="text-sm text-gray-600">計画書・手順書・モニタリングの生成スケジュール管理</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <DocumentScheduleDashboard />
      </main>
    </div>
  );
};

export default DocumentSchedulePage;
