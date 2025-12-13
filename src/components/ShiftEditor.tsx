import { useState } from 'react';
import type { Shift } from '../types';
import { SERVICE_CONFIG } from '../types';

interface Props {
  shift: Shift | null;
  helperId: string;
  date: string;
  onSave: (shift: Shift) => void;
  onDelete?: (shiftId: string) => void;
  onClose: () => void;
}

export function ShiftEditor({ shift, helperId, date, onSave, onDelete, onClose }: Props) {
  const [startTime, setStartTime] = useState(shift?.startTime || '');
  const [endTime, setEndTime] = useState(shift?.endTime || '');
  const [clientName, setClientName] = useState(shift?.clientName || '');
  const [serviceType, setServiceType] = useState<string>(shift?.serviceType || 'shintai');
  const [duration, setDuration] = useState(shift?.duration.toString() || '');
  const [area, setArea] = useState(shift?.area || '');

  const handleSave = () => {
    if (!startTime || !endTime || !clientName || !duration) {
      alert('すべての項目を入力してください');
      return;
    }

    const newShift: Shift = {
      id: shift?.id || `shift-${Date.now()}`,
      date,
      helperId,
      clientName,
      serviceType: serviceType as any,
      startTime,
      endTime,
      duration: parseFloat(duration),
      area,
    };

    onSave(newShift);
    onClose();
  };

  const handleDelete = () => {
    if (shift && onDelete && confirm('このケア内容を削除しますか？')) {
      onDelete(shift.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="p-4 border-b bg-gradient-to-r from-blue-500 to-purple-600 flex justify-between items-center rounded-t-lg">
          <h2 className="text-xl font-bold text-white">
            {shift ? 'ケア内容を編集' : 'ケア内容を追加'}
          </h2>
          <button
            onClick={onClose}
            className="text-white hover:bg-white hover:bg-opacity-20 rounded-full w-8 h-8 flex items-center justify-center text-2xl font-bold transition-colors"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">開始時刻</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 border rounded focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">終了時刻</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 border rounded focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">利用者名</label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="例: 高志"
              className="w-full px-3 py-2 border rounded focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">サービス種類</label>
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              className="w-full px-3 py-2 border rounded focus:outline-none focus:border-blue-500"
            >
              {Object.entries(SERVICE_CONFIG).map(([key, config]) => (
                <option key={key} value={key}>
                  {config.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">時間数</label>
            <input
              type="number"
              step="0.5"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="例: 1.5"
              className="w-full px-3 py-2 border rounded focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">エリア</label>
            <input
              type="text"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="例: 住之江区"
              className="w-full px-3 py-2 border rounded focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="p-4 border-t flex justify-between gap-3">
          <div>
            {shift && onDelete && (
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-500 text-white rounded font-semibold hover:bg-red-600"
              >
                削除
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded font-semibold hover:bg-gray-300"
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded font-semibold hover:shadow-md"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
