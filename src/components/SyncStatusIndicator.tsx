/**
 * シフト同期状態インジケーター
 * リアルタイム同期の状態を表示するコンポーネント
 */

import { memo } from 'react';
import type { SyncStatus } from '../services/shiftSyncService';

interface Props {
  status: SyncStatus;
  lastUpdate?: Date;
  shiftsCount?: number;
}

export const SyncStatusIndicator = memo(({ status, lastUpdate, shiftsCount }: Props) => {
  // ステータスに応じたアイコンと色
  const statusConfig = {
    idle: {
      icon: '⚫',
      color: 'text-gray-400',
      bgColor: 'bg-gray-100',
      label: '待機中'
    },
    syncing: {
      icon: '🔄',
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
      label: '同期中...',
      animate: true
    },
    success: {
      icon: '✅',
      color: 'text-green-600',
      bgColor: 'bg-green-100',
      label: '同期完了'
    },
    error: {
      icon: '❌',
      color: 'text-red-600',
      bgColor: 'bg-red-100',
      label: '同期エラー'
    }
  };

  const config = statusConfig[status];

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${config.bgColor}`}>
      <span className={config.animate ? 'animate-spin' : ''}>
        {config.icon}
      </span>
      <div className="flex flex-col">
        <span className={`text-xs font-medium ${config.color}`}>
          {config.label}
        </span>
        {lastUpdate && status === 'success' && (
          <span className="text-[10px] text-gray-500">
            {lastUpdate.toLocaleTimeString('ja-JP')}
          </span>
        )}
        {shiftsCount !== undefined && (
          <span className="text-[10px] text-gray-500">
            {shiftsCount}件のシフト
          </span>
        )}
      </div>
    </div>
  );
});

SyncStatusIndicator.displayName = 'SyncStatusIndicator';
