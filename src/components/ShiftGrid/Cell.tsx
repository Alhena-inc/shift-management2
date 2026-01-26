
import React, { useState, useRef, useEffect } from 'react';
import { CellData, GridMode } from './types';

interface CellProps {
    data: CellData;
    isSelected: boolean;
    mode: GridMode;
    onValueChange: (value: string) => void;
    onModeChange: (mode: GridMode) => void;
    onNavigate: (direction: 'up' | 'down' | 'left' | 'right' | 'next') => void;
    row: number;
    col: number;
}

export const Cell: React.FC<CellProps> = ({
    data,
    isSelected,
    mode,
    onValueChange,
    onModeChange,
    onNavigate,
}) => {
    const [localValue, setLocalValue] = useState(data.value);
    const isComposing = useRef(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // 同期
    useEffect(() => {
        setLocalValue(data.value);
    }, [data.value]);

    // フォーカス制御
    useEffect(() => {
        if (isSelected && inputRef.current) {
            inputRef.current.focus();
            if (mode === 'ready') {
                inputRef.current.select();
            }
        }
    }, [isSelected, mode]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (isComposing.current) return;

        if (e.key === 'Enter') {
            if (mode === 'ready' || !isComposing.current) {
                onNavigate('down');
                onModeChange('ready');
            }
        } else if (e.key === 'Tab') {
            e.preventDefault();
            onNavigate('next');
            onModeChange('ready');
        } else if (e.key === 'Escape') {
            setLocalValue(data.value);
            onModeChange('ready');
        } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            if (mode === 'ready') {
                e.preventDefault();
                const dir = e.key.replace('Arrow', '').toLowerCase() as any;
                onNavigate(dir);
            }
        } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && mode === 'ready') {
            // 文字入力開始 -> Editモードへ
            onModeChange('edit');
        }
    };

    const handleBlur = () => {
        if (localValue !== data.value) {
            onValueChange(localValue);
        }
        onModeChange('ready');
    };

    return (
        <div
            className={`relative w-full h-full flex items-center justify-center box-border ${isSelected ? 'z-20' : 'z-10'}`}
            style={{
                height: '20px',
                backgroundColor: data.bgColor || 'transparent',
            }}
        >
            {/* 以前のUIを表示用Spanとして維持 */}
            <span
                className="absolute inset-0 flex items-center justify-center px-0.5 pointer-events-none overflow-hidden whitespace-nowrap"
                style={{
                    color: '#000',
                    fontSize: '10px',
                    fontWeight: data.isBold ? 'bold' : 'normal',
                    opacity: isSelected && mode === 'edit' ? 0 : 1, // 編集時は隠す
                }}
            >
                {data.hasWarning && <span className="mr-0.5">⚠️</span>}
                {data.value}
            </span>

            {/* 選択時または編集時にInputを表示 (ReadyモードでもInputを出すことで "nあ"問題を防ぐ) */}
            {(isSelected) && (
                <input
                    ref={inputRef}
                    className="absolute inset-0 w-full h-full p-0 m-0 bg-white border-none outline-none text-center"
                    style={{
                        fontSize: '10px',
                        color: '#000',
                        opacity: mode === 'ready' ? 0 : 1, // Ready時は透明（背後のSpanを見せる）だがフォーカスは受ける
                        caretColor: mode === 'ready' ? 'transparent' : 'black',
                    }}
                    value={localValue}
                    onChange={(e) => setLocalValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleBlur}
                    onCompositionStart={() => { isComposing.current = true; onModeChange('edit'); }}
                    onCompositionEnd={() => { isComposing.current = false; }}
                    onDoubleClick={() => onModeChange('edit')}
                />
            )}

            {/* 選択枠 (2px青枠) */}
            {isSelected && (
                <div
                    className="absolute inset-x-0 inset-y-0 pointer-events-none border-2 border-blue-600 z-30"
                    style={{ margin: '-1px' }}
                >
                    {/* オートフィルハンドル */}
                    <div className="absolute bottom-[-4px] right-[-4px] w-2 h-2 bg-blue-600 border border-white cursor-crosshair" />
                </div>
            )}
        </div>
    );
};
