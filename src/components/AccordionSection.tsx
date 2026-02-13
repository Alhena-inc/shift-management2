import React, { useState } from 'react';

export interface AccordionItem {
  key: string;
  title: string;
  summary?: string;
  summaryColor?: string;
  content: React.ReactNode;
  /** trueの場合、詳細ボタンでアコーディオン開閉ではなく onNavigate を呼ぶ */
  navigable?: boolean;
}

interface Props {
  sections: AccordionItem[];
  onNavigate?: (key: string) => void;
}

const AccordionSection: React.FC<Props> = ({ sections, onNavigate }) => {
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
  const toggle = (key: string) => {
    setOpenKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  return (
    <div className="divide-y divide-gray-200">
      {sections.map(({ key, title, summary, summaryColor, content, navigable }) => (
        <div key={key}>
          <div className="flex items-center py-3 gap-3">
            <button
              onClick={() => navigable && onNavigate ? onNavigate(key) : toggle(key)}
              className="px-3 py-1 text-xs font-medium border border-gray-300 rounded bg-white hover:bg-gray-50 text-gray-600 whitespace-nowrap"
            >
              {!navigable && openKeys.has(key) ? '閉じる' : '詳細'}
            </button>
            <span className="font-medium text-gray-800">{title}</span>
            {summary && (
              <span className="text-sm ml-4" style={summaryColor ? { color: summaryColor, fontWeight: 'bold' } : { color: '#374151' }}>
                {summary}
              </span>
            )}
          </div>
          {!navigable && openKeys.has(key) && (
            <div className="pb-4 pl-2 pr-2">
              {content}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default AccordionSection;
