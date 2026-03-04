import React from 'react';
import type { RegenNotification } from '../hooks/useAutoRegeneration';

interface Props {
  notifications: RegenNotification[];
  onClear: (id: string) => void;
}

const STATUS_STYLES: Record<RegenNotification['status'], { bg: string; border: string; text: string; icon: string }> = {
  generating: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', icon: '🔄' },
  success: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', icon: '✅' },
  error: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', icon: '❌' },
};

const AutoRegenNotificationToast: React.FC<Props> = ({ notifications, onClear }) => {
  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {notifications.map(n => {
        const style = STATUS_STYLES[n.status];
        return (
          <div
            key={n.id}
            className={`${style.bg} ${style.border} border rounded-lg shadow-lg p-3 flex items-start gap-2 animate-in fade-in slide-in-from-right`}
          >
            {n.status === 'generating' ? (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent mt-0.5 flex-shrink-0" />
            ) : (
              <span className="flex-shrink-0 text-sm">{style.icon}</span>
            )}
            <p className={`${style.text} text-sm flex-1`}>{n.message}</p>
            {n.status !== 'generating' && (
              <button
                onClick={() => onClear(n.id)}
                className="text-gray-400 hover:text-gray-600 text-xs flex-shrink-0 ml-1"
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default AutoRegenNotificationToast;
