import React, { useState, useCallback } from 'react';
import { RangeSelectableGrid } from '../components/RangeSelectableGrid';
import type { NormalizedRange } from '../hooks/useRangeSelection';

/**
 * 範囲選択機能のデモページ
 * /range-selection-demo でアクセス
 */
const RangeSelectionDemo: React.FC = () => {
  // 選択されたセルの情報を表示用
  const [selectedInfo, setSelectedInfo] = useState<{
    range: NormalizedRange | null;
    cells: Array<{ row: number; col: number }>;
  }>({ range: null, cells: [] });

  // コンテキストメニュー表示状態
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    visible: boolean;
  }>({ x: 0, y: 0, visible: false });

  // サンプルデータ
  const rowHeaders = [
    '9:00', '10:00', '11:00', '12:00', '13:00',
    '14:00', '15:00', '16:00', '17:00', '18:00',
  ];

  const colHeaders = [
    '田中', '山田', '佐藤', '鈴木', '高橋',
    '伊藤', '渡辺', '中村', '小林', '加藤',
  ];

  // セルデータ（サンプル）
  const cellData = new Map([
    ['0-0', { id: '1', content: '身体介護', row: 0, col: 0 }],
    ['0-1', { id: '2', content: '生活援助', row: 0, col: 1 }],
    ['1-2', { id: '3', content: '通院介助', row: 1, col: 2 }],
    ['2-3', { id: '4', content: '身体介護', row: 2, col: 3 }],
    ['3-0', { id: '5', content: '生活援助', row: 3, col: 0 }],
    ['4-4', { id: '6', content: '身体介護', row: 4, col: 4 }],
    ['5-1', { id: '7', content: '通院介助', row: 5, col: 1 }],
  ]);

  // 選択完了時のハンドラ
  const handleSelectionComplete = useCallback(
    (range: NormalizedRange, cells: Array<{ row: number; col: number }>) => {
      setSelectedInfo({ range, cells });
      console.log('選択完了:', { range, cells });
    },
    []
  );

  // 右クリックハンドラ
  const handleContextMenu = useCallback(
    (
      event: React.MouseEvent,
      cells: Array<{ row: number; col: number }>,
      range: NormalizedRange | null
    ) => {
      event.preventDefault();
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        visible: true,
      });
      setSelectedInfo({ range, cells });
    },
    []
  );

  // コンテキストメニューを閉じる
  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, visible: false }));
  }, []);

  // メニューアクション
  const handleMenuAction = useCallback(
    (action: string) => {
      console.log(`アクション: ${action}`, selectedInfo);
      alert(`${action} を ${selectedInfo.cells.length} 件のセルに適用します`);
      closeContextMenu();
    },
    [selectedInfo, closeContextMenu]
  );

  return (
    <div
      className="min-h-screen bg-gray-100 p-6"
      onClick={closeContextMenu}
    >
      <div className="max-w-7xl mx-auto">
        {/* ヘッダー */}
        <div className="mb-6">
          <button
            onClick={() => (window.location.href = '/')}
            className="mb-4 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
          >
            ← ホームに戻る
          </button>
          <h1 className="text-2xl font-bold text-gray-800">
            📊 スプレッドシート風 範囲選択デモ
          </h1>
          <p className="text-gray-600 mt-2">
            マウスをドラッグして矩形範囲を選択できます。選択後、右クリックでコンテキストメニューが表示されます。
          </p>
        </div>

        {/* 操作説明 */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <h2 className="font-bold text-gray-700 mb-2">操作方法</h2>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• <strong>ドラッグ選択</strong>: セル上でマウスを押したままドラッグ</li>
            <li>• <strong>右クリック</strong>: 選択範囲上で右クリックするとメニュー表示</li>
            <li>• <strong>選択解除</strong>: 別のセルをクリックすると新しい選択開始</li>
          </ul>
        </div>

        {/* グリッド */}
        <div className="bg-white rounded-lg shadow-lg p-4 mb-6">
          <RangeSelectableGrid
            rows={10}
            cols={10}
            rowHeaders={rowHeaders}
            colHeaders={colHeaders}
            cellData={cellData}
            cellWidth={100}
            cellHeight={50}
            requireShiftKey={false}
            onSelectionComplete={handleSelectionComplete}
            onCellContextMenu={handleContextMenu}
          />
        </div>

        {/* 選択情報表示 */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <h2 className="font-bold text-gray-700 mb-2">選択情報</h2>
          {selectedInfo.range ? (
            <div className="text-sm text-gray-600">
              <p>
                <strong>範囲:</strong> 行 {selectedInfo.range.minRow} 〜{' '}
                {selectedInfo.range.maxRow}, 列 {selectedInfo.range.minCol} 〜{' '}
                {selectedInfo.range.maxCol}
              </p>
              <p>
                <strong>選択セル数:</strong> {selectedInfo.cells.length} 件
              </p>
              <p>
                <strong>時間範囲:</strong>{' '}
                {rowHeaders[selectedInfo.range.minRow]} 〜{' '}
                {rowHeaders[selectedInfo.range.maxRow]}
              </p>
              <p>
                <strong>スタッフ:</strong>{' '}
                {colHeaders
                  .slice(selectedInfo.range.minCol, selectedInfo.range.maxCol + 1)
                  .join(', ')}
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-400">セルをドラッグして範囲を選択してください</p>
          )}
        </div>
      </div>

      {/* コンテキストメニュー */}
      {contextMenu.visible && (
        <div
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 1000,
          }}
          className="bg-white rounded-lg shadow-xl border border-gray-200 py-2 min-w-[180px]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
            <span className="text-xs font-bold text-gray-500">
              {selectedInfo.cells.length} 件選択中
            </span>
          </div>
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-blue-50 text-blue-600"
            onClick={() => handleMenuAction('シフト追加')}
          >
            ➕ シフト追加
          </button>
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-yellow-50 text-yellow-600"
            onClick={() => handleMenuAction('キャンセル（時間残す）')}
          >
            ⚠️ キャンセル（時間残す）
          </button>
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-orange-50 text-orange-600"
            onClick={() => handleMenuAction('キャンセル（時間削除）')}
          >
            🚫 キャンセル（時間削除）
          </button>
          <div className="border-t border-gray-200 my-1" />
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 text-red-600"
            onClick={() => handleMenuAction('ケア削除')}
          >
            🗑️ ケア削除
          </button>
          <div className="border-t border-gray-200 my-1" />
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-pink-50 text-pink-600"
            onClick={() => handleMenuAction('休み希望')}
          >
            🏖️ 休み希望
          </button>
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-green-50 text-green-600"
            onClick={() => handleMenuAction('指定休')}
          >
            📅 指定休
          </button>
        </div>
      )}
    </div>
  );
};

export default RangeSelectionDemo;

